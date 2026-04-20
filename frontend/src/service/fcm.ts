import notifee from '@notifee/react-native';
import messaging, {
    type RemoteMessage,
} from '@react-native-firebase/messaging';

export const getAndSendFcmToken = async () => {
    await messaging().registerDeviceForRemoteMessages();
    const token = await messaging().getToken();
    // Send to your Django backend
    await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/fcm-token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    });
};

export const onMessageReceived = async (remoteMessage: RemoteMessage) => {
    // Django sends either:
    // A) Full Notifee payload in data.notifee (recommended)
    // B) Minimal data → you build the notification here

    if (remoteMessage.data?.notifee) {
        await notifee.displayNotification(
            JSON.parse(remoteMessage.data.notifee),
        );
    } else {
        // Option B – build from minimal data
        await notifee.displayNotification({
            title: remoteMessage.notification?.title || 'New Notification',
            body: remoteMessage.notification?.body || '',
            data: remoteMessage.data,
            android: { channelId: 'default' },
        });
    }
};

// Foreground
messaging().onMessage(onMessageReceived);

// Background / Quit (CRITICAL)
messaging().setBackgroundMessageHandler(onMessageReceived);
