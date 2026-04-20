import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getDeviceId } from './src/service/deviceId';
import { getAndSendFcmToken } from './src/service/fcm';
import { initializeNotifee } from './src/service/notifications';
import {
    connectWebSocket,
    disconnectWebSocket,
    onWsStatus,
} from './src/service/websocket';

const App = () => {
    const [wsStatus, setWsStatus] = useState<string>('idle');
    const deviceId = getDeviceId();

    useEffect(() => {
        initializeNotifee();
        getAndSendFcmToken();
        connectWebSocket(deviceId);
        const unsubscribe = onWsStatus(setWsStatus);
        return () => {
            unsubscribe();
            disconnectWebSocket();
        };
    }, [deviceId]);

    return (
        <>
            <StatusBar style="auto" />
            <View style={styles.container}>
                <Text style={styles.heading}>notiftest</Text>
                <Text>device_id: {deviceId}</Text>
                <Text>WS: {wsStatus}</Text>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    heading: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 12,
    },
});

export default App;
