import notifee from '@notifee/react-native';
import messaging, {
    type RemoteMessage,
} from '@react-native-firebase/messaging';

import { getDeviceId } from './deviceId';

export const getAndSendFcmToken = async () => {
    await messaging().registerDeviceForRemoteMessages();
    const token = await messaging().getToken();
    console.log('📱 FCM token:', token.slice(0, 24), '…');

    const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? ''}/fcm-token/`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, device_id: getDeviceId() }),
        },
    );
    if (!res.ok) {
        console.warn('FCM token registration failed', res.status);
    }
};

const ensureDefaultChannel = async () => {
    await notifee.createChannel({ id: 'default', name: 'Default Channel' });
};

export const onMessageReceived = async (remoteMessage: RemoteMessage) => {
    console.log('📨 FCM received:', JSON.stringify(remoteMessage));
    try {
        await ensureDefaultChannel();

        if (remoteMessage.data?.notifee) {
            const payload = JSON.parse(remoteMessage.data.notifee);
            await notifee.displayNotification(payload);
            return;
        }
        await notifee.displayNotification({
            title: remoteMessage.notification?.title || 'New Notification',
            body: remoteMessage.notification?.body || '',
            data: (remoteMessage.data as Record<string, string>) ?? {},
            android: { channelId: 'default' },
        });
    } catch (e) {
        console.warn('FCM display failed', e);
    }
};
