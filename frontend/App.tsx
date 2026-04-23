import messaging from '@react-native-firebase/messaging';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Provider } from 'react-redux';

import { RootNavigator } from './src/nav/RootNavigator';
import { OfferOverlay } from './src/offer/OfferOverlay';
import { EnvelopeError, validateEnvelope } from './src/service/envelope';
import { getAndSendFcmToken } from './src/service/fcm';
import { connectWebSocket, disconnectWebSocket } from './src/service/websocket';
import { store } from './src/store';
import { initializeBoot } from './src/store/bootSlice';
import { offerReceived } from './src/store/offerSlice';

const HydrationSplash = () => (
    <View style={styles.splash}>
        <ActivityIndicator />
        <Text style={styles.splashText}>Loading…</Text>
    </View>
);

const InnerApp = () => {
    const appStateRef = useRef(AppState.currentState);

    useEffect(() => {
        void getAndSendFcmToken();
        void connectWebSocket();
        const unsub = async (remoteMessage: unknown) => {
            try {
                const msg = remoteMessage as Record<string, unknown>;
                const data = msg?.data as Record<string, unknown> | undefined;
                const raw = data?.envelope;
                if (typeof raw !== 'string') return;
                const envelope = validateEnvelope(JSON.parse(raw));
                store.dispatch(offerReceived(envelope));
            } catch (err) {
                if (err instanceof EnvelopeError) {
                    console.warn('bad foreground FCM envelope', err.message);
                }
            }
        };
        const offMessage = messaging().onMessage(unsub);
        return () => {
            offMessage();
            disconnectWebSocket();
        };
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener(
            'change',
            nextAppState => {
                const wasBackground = ['background', 'inactive'].includes(
                    appStateRef.current,
                );
                const isActive = nextAppState === 'active';
                appStateRef.current = nextAppState;
                if (wasBackground && isActive) {
                    void connectWebSocket();
                }
            },
        );
        return () => subscription.remove();
    }, []);

    return (
        <>
            <RootNavigator />
            <OfferOverlay />
        </>
    );
};

const App = () => {
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        void store.dispatch(initializeBoot()).finally(() => setHydrated(true));
    }, []);

    if (!hydrated) return <HydrationSplash />;

    return (
        <Provider store={store}>
            <InnerApp />
        </Provider>
    );
};

const styles = StyleSheet.create({
    splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    splashText: { color: '#555' },
});

export default App;
