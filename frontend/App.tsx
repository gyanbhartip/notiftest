import messaging from '@react-native-firebase/messaging';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Provider } from 'react-redux';

import { OfferOverlay } from './src/offer/OfferOverlay';
import { RootNavigator } from './src/nav/RootNavigator';
import { getAndSendFcmToken } from './src/service/fcm';
import {
    validateEnvelope,
    EnvelopeError,
} from './src/service/envelope';
import {
    connectWebSocket,
    disconnectWebSocket,
} from './src/service/websocket';
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
