import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { getDeviceId } from './src/service/deviceId';
import { validateEnvelope, EnvelopeError } from './src/service/envelope';
import { displayOfferNotification } from './src/service/notifications';
import { acceptOfferHttp } from './src/service/offerApi';
import { writePendingMutation } from './src/store/persistence';

messaging().setBackgroundMessageHandler(async remoteMessage => {
    try {
        const envelopeRaw = remoteMessage.data?.envelope;
        if (typeof envelopeRaw !== 'string' || !envelopeRaw) return;
        const envelope = validateEnvelope(JSON.parse(envelopeRaw));
        await displayOfferNotification(envelope);
    } catch (err) {
        if (err instanceof EnvelopeError) {
            console.warn('bad envelope in background FCM', err.message);
        } else {
            console.warn('background FCM failed', err);
        }
    }
});

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

registerRootComponent(App);
