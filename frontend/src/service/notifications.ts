import notifee, {
    AndroidImportance,
    AuthorizationStatus,
} from '@notifee/react-native';

export const initializeNotifee = async () => {
    // Request permissions (iOS + Android 13+)
    const settings = await notifee.requestPermission();

    if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
        console.warn('Notifications denied by user');
    }

    // Create default Android channel (required for Android)
    await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
    });

    // Optional: more channels (e.g., 'orders', 'chat', etc.)
};
