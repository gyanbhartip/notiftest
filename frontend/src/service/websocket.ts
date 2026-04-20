import notifee from '@notifee/react-native';

type StatusListener = (status: string) => void;

let socket: WebSocket | null = null;
const listeners: Array<StatusListener> = [];
let lastStatus = 'idle';

const emit = (status: string) => {
    lastStatus = status;
    for (const l of listeners) l(status);
};

export const onWsStatus = (cb: StatusListener) => {
    listeners.push(cb);
    cb(lastStatus);
    return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
    };
};

export const connectWebSocket = (userId: string) => {
    if (socket) return;

    const url = `${process.env.EXPO_PUBLIC_WS_URL ?? ''}?user_id=${encodeURIComponent(userId)}`;
    socket = new WebSocket(url);
    emit('connecting');

    socket.onopen = () => emit('connected');

    socket.onmessage = async event => {
        try {
            const data = JSON.parse(event.data);
            await notifee.displayNotification({
                id: data.id || Date.now().toString(),
                title: data.title,
                body: data.body,
                data: data.data || {},
                android: {
                    channelId: data.channelId || 'default',
                    pressAction: { id: 'default' },
                    ...data.android,
                },
                ios: data.ios,
            });
        } catch (e) {
            console.warn('WS message parse/display failed', e);
        }
    };

    socket.onerror = () => emit('error');

    socket.onclose = () => {
        socket = null;
        emit('disconnected');
    };
};

export const disconnectWebSocket = () => {
    socket?.close();
    socket = null;
};
