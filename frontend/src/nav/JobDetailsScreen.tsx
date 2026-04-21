import React from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useAppSelector } from '../store';

export const JobDetailsScreen = () => {
    const lastAccepted = useAppSelector(s => s.offer.acceptedOfferIds.at(-1));
    const history = useAppSelector(s => s.offer.history);
    const lastEntry = history.find(
        h => h.offer_id === lastAccepted && h.status === 'accepted',
    );

    if (!lastAccepted || !lastEntry) {
        return (
            <View style={styles.empty}>
                <Text>No accepted offer.</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Job accepted</Text>
            <Text style={styles.muted}>Offer ID: {lastAccepted}</Text>
            <Text style={styles.sectionLabel}>Resolved at</Text>
            <Text>{lastEntry.resolved_at}</Text>
            <View style={styles.actionsRow}>
                <Pressable
                    onPress={() => Linking.openURL('tel:+911234567890')}
                    style={styles.btn}>
                    <Text style={styles.btnText}>Call customer (stub)</Text>
                </Pressable>
                <Pressable
                    onPress={() =>
                        Linking.openURL('google.navigation:q=18.5204,73.8567')
                    }
                    style={styles.btn}>
                    <Text style={styles.btnText}>Navigate (stub)</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20, gap: 8 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: '700' },
    muted: { color: '#777' },
    sectionLabel: { marginTop: 12, fontWeight: '600' },
    actionsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    btn: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        backgroundColor: '#1e88e5',
        alignItems: 'center',
    },
    btnText: { color: '#fff', fontWeight: '700' },
});
