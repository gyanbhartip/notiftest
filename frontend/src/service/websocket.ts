import notifee from '@notifee/react-native';

let socket: WebSocket | null = null;

export const connectWebSocket = (userToken: string, userId: string) => {
    if (socket) return;

    socket = new WebSocket(
        `${process.env.EXPO_PUBLIC_WS_URL ?? ''}?token=${userToken}&user_id=${userId}`,
    );

    socket.onopen = () => {
        console.log('✅ WS connected - primary notification path active');
    };

    socket.onmessage = async event => {
        const data = JSON.parse(event.data); // { title, body, data?, android?, ios? }

        // Display via Notifee (primary path)
        await notifee.displayNotification({
            id: data.id || Date.now().toString(),
            title: data.title,
            body: data.body,
            data: data.data || {}, // for deep linking / actions
            android: {
                channelId: data.channelId || 'default',
                pressAction: { id: 'default' },
                ...data.android, // rich styles, actions, etc.
            },
            ios: data.ios,
        });
    };

    socket.onclose = () => {
        console.log('WS closed - falling back to FCM');
        socket = null;
    };

    socket.onerror = e => console.error('WS error', e);
};

export const disconnectWebSocket = () => {
    socket?.close();
    socket = null;
};
