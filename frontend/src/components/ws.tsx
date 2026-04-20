import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

const WS = () => {
    const [ws, setWs] = useState<WebSocket | undefined>(undefined);
    const [message, setMessage] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        const connectWebSocket = async () => {
            const ws = new WebSocket(
                `${process.env.EXPO_PUBLIC_WS_URL ?? ''}?user_id=${Math.random().toString(36).substring(2, 15)}`,
            );
            ws.onopen = () => {
                setMessage('Connected to WebSocket');
            };
            ws.onmessage = (event: MessageEvent) => {
                setMessage(event.data);
            };
            ws.onerror = (error: Event) => {
                setError(`Error: ${error.toString()}`);
            };
            ws.onclose = () => {
                setError('Disconnected from WebSocket');
            };
            setWs(ws);
        };
        connectWebSocket();
    }, []);

    return (
        <View>
            <Text>WebSocket Connection Status: {ws?.readyState}</Text>
            <Text>Last Message: {message}</Text>
            <Text>Error: {error}</Text>
        </View>
    );
};

export default WS;
