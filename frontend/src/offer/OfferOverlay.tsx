import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    Vibration,
    View,
} from 'react-native';
import { getDeviceId } from '../service/deviceId';
import { useAppDispatch, useAppSelector } from '../store';
import {
    acceptOffer,
    clearActiveOffer,
    declineOffer,
} from '../store/offerSlice';
import type { DeclineReason } from '../types/offer';
import { DeclineReasonSheet } from './DeclineReasonSheet';
import { OfferCard } from './OfferCard';
import { useCountdown } from './useCountdown';

const formatRemaining = (ms: number): string => {
    const s = Math.ceil(ms / 1000);
    return `${s}s`;
};

export const OfferOverlay = () => {
    const dispatch = useAppDispatch();
    const activeOffer = useAppSelector(s => s.offer.activeOffer);
    const pendingAction = useAppSelector(s => s.offer.pendingAction);
    const postError = useAppSelector(s => s.offer.postError);
    const remainingMs = useCountdown(activeOffer?.expires_at ?? null);
    const [declineOpen, setDeclineOpen] = useState(false);

    React.useEffect(() => {
        if (activeOffer) Vibration.vibrate([0, 400, 200, 400]);
    }, [activeOffer?.offer_id]);

    const handleAccept = useCallback(async () => {
        if (!activeOffer) return;
        const device_id = await getDeviceId();
        await dispatch(
            acceptOffer({ offer_id: activeOffer.offer_id, device_id }),
        );
    }, [activeOffer, dispatch]);

    const handleDeclineSubmit = useCallback(
        async (reason: DeclineReason) => {
            if (!activeOffer) return;
            const device_id = await getDeviceId();
            setDeclineOpen(false);
            await dispatch(
                declineOffer({
                    offer_id: activeOffer.offer_id,
                    device_id,
                    reason,
                }),
            );
        },
        [activeOffer, dispatch],
    );

    if (!activeOffer) return null;

    const totalMs = activeOffer.expires_ms_total;
    const pct = Math.max(0, Math.min(1, remainingMs / totalMs));

    return (
        <Modal visible animationType="fade" transparent>
            <View style={styles.backdrop}>
                <View style={styles.container}>
                    <View style={styles.countdownRow}>
                        <View style={styles.countdownBarBg}>
                            <View
                                style={[
                                    styles.countdownBar,
                                    { width: `${pct * 100}%` },
                                    pct < 0.25 && styles.countdownBarUrgent,
                                ]}
                            />
                        </View>
                        <Text style={styles.countdownText}>
                            {formatRemaining(remainingMs)}
                        </Text>
                    </View>

                    <ScrollView contentContainerStyle={styles.scroll}>
                        <OfferCard payload={activeOffer.payload} />
                    </ScrollView>

                    {postError ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>
                                Error: {postError.message}
                            </Text>
                            <Pressable
                                onPress={handleAccept}
                                style={styles.retryBtn}>
                                <Text style={styles.retryBtnText}>
                                    Retry accept
                                </Text>
                            </Pressable>
                        </View>
                    ) : null}

                    <View style={styles.actionsRow}>
                        <Pressable
                            onPress={() => setDeclineOpen(true)}
                            disabled={pendingAction !== null}
                            style={[styles.actionBtn, styles.declineBtn]}>
                            <Text style={styles.declineBtnText}>Decline</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleAccept}
                            disabled={pendingAction !== null}
                            style={[styles.actionBtn, styles.acceptBtn]}>
                            {pendingAction === 'accepting' ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.acceptBtnText}>Accept</Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <DeclineReasonSheet
                    visible={declineOpen}
                    onCancel={() => setDeclineOpen(false)}
                    onSubmit={handleDeclineSubmit}
                />

                {/* fallback dismiss in error state only — not on happy path */}
                {postError && remainingMs === 0 ? (
                    <Pressable
                        style={styles.dismissLink}
                        onPress={() => dispatch(clearActiveOffer())}>
                        <Text style={styles.dismissLinkText}>Dismiss</Text>
                    </Pressable>
                ) : null}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    container: {
        flex: 1,
        paddingTop: 60,
        paddingBottom: 30,
        paddingHorizontal: 16,
    },
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    countdownBarBg: {
        flex: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 5,
        overflow: 'hidden',
    },
    countdownBar: {
        height: '100%',
        backgroundColor: '#4caf50',
        borderRadius: 5,
    },
    countdownBarUrgent: { backgroundColor: '#e53935' },
    countdownText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        width: 48,
        textAlign: 'right',
    },
    scroll: { paddingBottom: 16 },
    errorBox: {
        backgroundColor: '#c62828',
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
    },
    errorText: { color: '#fff', fontSize: 14 },
    retryBtn: {
        marginTop: 8,
        backgroundColor: '#fff',
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    retryBtnText: { color: '#c62828', fontWeight: '700' },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    declineBtn: { backgroundColor: '#424242' },
    declineBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    acceptBtn: { backgroundColor: '#2e7d32' },
    acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    dismissLink: {
        position: 'absolute',
        top: 20,
        right: 20,
    },
    dismissLinkText: { color: '#ddd', fontSize: 14 },
});
