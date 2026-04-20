import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import WS from './src/components/ws';
import { getAndSendFcmToken } from './src/service/fcm';
import { initializeNotifee } from './src/service/notifications';
import { connectWebSocket } from './src/service/websocket';

const App = () => {
    useEffect(() => {
        initializeNotifee();
        getAndSendFcmToken(); // → Django
        connectWebSocket(token, userId); // → FastAPI (primary)
    }, []);
    return (
        <>
            <StatusBar style="auto" />
            <View style={styles.container}>
                <WS />
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
    },
});

export default App;
