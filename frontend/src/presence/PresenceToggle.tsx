import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getDeviceId } from '../service/deviceId';
import { useAppDispatch, useAppSelector } from '../store';
import { toggleIntent } from '../store/presenceSlice';

export const PresenceToggle = () => {
    const dispatch = useAppDispatch();
    const intent = useAppSelector(s => s.presence.intent);
    const status = useAppSelector(s => s.presence.status);
    const lastError = useAppSelector(s => s.presence.lastError);

    const busy = status === 'going_online' || status === 'going_offline';
    const isOnline = intent === 'online';

    const handleToggle = useCallback(async () => {
        if (busy) return;
        const device_id = await getDeviceId();
        const next = isOnline ? 'offline' : 'online';
        await dispatch(toggleIntent({ device_id, intent: next }));
    }, [busy, dispatch, isOnline]);

    return (
        <View style={styles.row}>
            <Pressable
                onPress={handleToggle}
                disabled={busy}
                style={[
                    styles.btn,
                    isOnline && styles.btnOn,
                    busy && styles.btnBusy,
                ]}>
                <Text style={[styles.btnText, isOnline && styles.btnTextOn]}>
                    {busy
                        ? '...'
                        : isOnline
                          ? 'Online — tap to go Offline'
                          : 'Offline — tap to go Online'}
                </Text>
            </Pressable>
            {status === 'offline_stale' ? (
                <Text style={styles.staleText}>Connection stale</Text>
            ) : null}
            {lastError ? (
                <Text style={styles.errorText}>{lastError}</Text>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    row: { padding: 16, gap: 8 },
    btn: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    btnOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
    btnBusy: { opacity: 0.6 },
    btnText: { color: '#333', fontWeight: '600' },
    btnTextOn: { color: '#fff' },
    staleText: { color: '#e65100', fontSize: 12 },
    errorText: { color: '#c62828', fontSize: 12 },
});
