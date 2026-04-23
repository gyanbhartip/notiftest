import notifee, { EventType } from '@notifee/react-native';
import messaging, {
    type RemoteMessage,
} from '@react-native-firebase/messaging';
import { registerRootComponent } from 'expo';
import App from './App';
import { getDeviceId } from './src/service/deviceId';
import { EnvelopeError, validateEnvelope } from './src/service/envelope';
import {
    displayOfferNotification,
    initializeNotifee,
} from './src/service/notifications';
import { acceptOfferHttp } from './src/service/offerApi';
import { writePendingMutation } from './src/store/persistence';

const handleFcmMessage = async (
    remoteMessage: RemoteMessage,
    context: 'foreground' | 'background',
) => {
    console.log(
        `📨 FCM ${context} received:`,
        JSON.stringify(remoteMessage.data),
    );
    try {
        const envelopeRaw = remoteMessage.data?.envelope;
        if (typeof envelopeRaw !== 'string' || !envelopeRaw) {
            console.warn(`📨 FCM ${context}: no envelope in data`);
            return;
        }
        const envelope = validateEnvelope(JSON.parse(envelopeRaw));
        console.log(`📨 FCM ${context}: envelope valid, displaying...`);
        await displayOfferNotification(envelope);
        console.log(`📨 FCM ${context}: notification displayed`);
    } catch (err) {
        if (err instanceof EnvelopeError) {
            console.warn(`bad envelope in ${context} FCM`, err.message);
        } else {
            console.warn(`${context} FCM failed`, err);
        }
    }
};

messaging().setBackgroundMessageHandler(msg =>
    handleFcmMessage(msg, 'background'),
);
messaging().onMessage(msg => handleFcmMessage(msg, 'foreground'));

notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;
    const actionId = detail.pressAction?.id;
    const offerId = detail.notification?.id;
    if (!offerId || actionId !== 'accept') return;

    try {
        const deviceId = await getDeviceId();
        await acceptOfferHttp(offerId, deviceId);
        await writePendingMutation({
            offer_id: offerId,
            action: 'accept',
            ts: Date.now(),
        });
        await notifee.cancelNotification(offerId);
    } catch (err) {
        console.warn('background accept failed', err);
    }
});

void initializeNotifee();
registerRootComponent(App);
