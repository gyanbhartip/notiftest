import notifee, {
    AndroidImportance,
    AuthorizationStatus,
} from '@notifee/react-native';
import type { OfferEnvelope, ServiceVisitPayload } from '../types/offer';

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

export const OFFERS_CHANNEL_ID = 'offers';

export const ensureOffersChannel = async (): Promise<void> => {
    await notifee.createChannel({
        id: OFFERS_CHANNEL_ID,
        name: 'Offers',
        importance: AndroidImportance.HIGH,
    });
};

const buildTitle = (payload: ServiceVisitPayload): string => {
    const prefix = payload.issue.urgency === 'emergency' ? '🚨 ' : '';
    return `${prefix}${payload.appliance.category} — ${payload.appointment.slot_label}`;
};

const buildBody = (payload: ServiceVisitPayload): string =>
    `${payload.issue.title} • ${payload.address.city}`;

export const displayOfferNotification = async (
    envelope: OfferEnvelope,
): Promise<void> => {
    await ensureOffersChannel();
    await notifee.displayNotification({
        id: envelope.offer_id,
        title: buildTitle(envelope.payload),
        body: buildBody(envelope.payload),
        data: { offer_id: envelope.offer_id },
        android: {
            channelId: OFFERS_CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            pressAction: { id: 'default', launchActivity: 'default' },
            actions: [
                {
                    title: 'Accept',
                    pressAction: { id: 'accept', launchActivity: 'default' },
                },
            ],
        },
    });
};
