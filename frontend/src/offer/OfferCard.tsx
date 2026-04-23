import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServiceVisitPayload } from '../types/offer';

type Props = { payload: ServiceVisitPayload };

const prettyCategory = (c: string): string =>
    c.replace('_', ' ').replace(/^./, s => s.toUpperCase());

export const OfferCard = ({ payload }: Props) => {
    const urgencyBadge =
        payload.issue.urgency === 'emergency'
            ? '🚨 EMERGENCY'
            : payload.issue.urgency.toUpperCase();
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.category}>
                    {prettyCategory(payload.appliance.category)}
                </Text>
                <Text
                    style={[
                        styles.urgency,
                        payload.issue.urgency === 'emergency' &&
                            styles.urgencyEmergency,
                    ]}>
                    {urgencyBadge}
                </Text>
            </View>
            <Text style={styles.title}>{payload.issue.title}</Text>
            <Text style={styles.description}>{payload.issue.description}</Text>

            <Text style={styles.sectionLabel}>Appointment</Text>
            <Text style={styles.sectionValue}>
                {payload.appointment.slot_label}
            </Text>

            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.sectionValue}>
                {payload.customer.name} ({payload.customer.type})
            </Text>
            <Text style={styles.sectionValueMuted}>
                {payload.customer.phone_masked}
            </Text>

            <Text style={styles.sectionLabel}>Address</Text>
            <Text style={styles.sectionValue}>
                {payload.address.line1}
                {payload.address.line2 ? `, ${payload.address.line2}` : ''}
            </Text>
            <Text style={styles.sectionValueMuted}>
                {payload.address.city} • {payload.address.postal}
            </Text>
            {payload.address.landmark ? (
                <Text style={styles.sectionValueMuted}>
                    Landmark: {payload.address.landmark}
                </Text>
            ) : null}

            {payload.appliance.brand || payload.appliance.model ? (
                <>
                    <Text style={styles.sectionLabel}>Appliance</Text>
                    <Text style={styles.sectionValue}>
                        {[payload.appliance.brand, payload.appliance.model]
                            .filter(Boolean)
                            .join(' ')}
                        {payload.appliance.age_years
                            ? ` • ${payload.appliance.age_years}y old`
                            : ''}
                    </Text>
                </>
            ) : null}

            {payload.issue.symptoms.length > 0 ? (
                <>
                    <Text style={styles.sectionLabel}>Symptoms</Text>
                    <Text style={styles.sectionValue}>
                        {payload.issue.symptoms.join(', ')}
                    </Text>
                </>
            ) : null}

            <Text style={styles.sectionLabel}>Estimated duration</Text>
            <Text style={styles.sectionValue}>
                {payload.job_meta.estimated_duration_minutes} min
                {payload.job_meta.requires_parts
                    ? ' • parts may be needed'
                    : ''}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    category: { fontSize: 14, fontWeight: '600', color: '#555' },
    urgency: { fontSize: 12, fontWeight: '700', color: '#1e88e5' },
    urgencyEmergency: { color: '#d32f2f' },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
    description: { fontSize: 14, color: '#333', marginBottom: 16 },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#888',
        textTransform: 'uppercase',
        marginTop: 10,
    },
    sectionValue: { fontSize: 15, color: '#111' },
    sectionValueMuted: { fontSize: 14, color: '#555' },
});
