import React, { useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import type { DeclineReason } from '../types/offer';

type Props = {
    visible: boolean;
    onCancel: () => void;
    onSubmit: (reason: DeclineReason) => void;
};

type ReasonKind = DeclineReason['kind'];

const OPTIONS: Array<{ kind: ReasonKind; label: string }> = [
    { kind: 'sick', label: 'Sick / unwell' },
    { kind: 'on_other_job', label: 'On another job' },
    { kind: 'vehicle_issue', label: 'Vehicle issue' },
    { kind: 'other', label: 'Other' },
];

export const DeclineReasonSheet = ({ visible, onCancel, onSubmit }: Props) => {
    const [selected, setSelected] = useState<ReasonKind | null>(null);
    const [otherText, setOtherText] = useState('');

    const canSubmit =
        selected !== null &&
        (selected !== 'other' || otherText.trim().length >= 3);

    const handleSubmit = () => {
        if (!selected) return;
        if (selected === 'other') {
            onSubmit({ kind: 'other', text: otherText.trim() });
        } else {
            onSubmit({ kind: selected } as DeclineReason);
        }
        setSelected(null);
        setOtherText('');
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <Text style={styles.title}>Decline offer</Text>
                    <Text style={styles.subtitle}>Tell dispatch why.</Text>
                    {OPTIONS.map(opt => {
                        const isSelected = selected === opt.kind;
                        return (
                            <Pressable
                                key={opt.kind}
                                onPress={() => setSelected(opt.kind)}
                                style={[
                                    styles.option,
                                    isSelected && styles.optionSelected,
                                ]}>
                                <Text
                                    style={[
                                        styles.optionLabel,
                                        isSelected &&
                                            styles.optionLabelSelected,
                                    ]}>
                                    {opt.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                    {selected === 'other' ? (
                        <TextInput
                            placeholder="At least 3 characters"
                            value={otherText}
                            onChangeText={setOtherText}
                            style={styles.otherInput}
                            multiline
                        />
                    ) : null}
                    <View style={styles.actionsRow}>
                        <Pressable
                            onPress={onCancel}
                            style={[styles.btn, styles.btnGhost]}>
                            <Text style={styles.btnGhostText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            style={[
                                styles.btn,
                                styles.btnPrimary,
                                !canSubmit && styles.btnDisabled,
                            ]}>
                            <Text style={styles.btnPrimaryText}>Submit</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
        backgroundColor: '#fff',
        padding: 20,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { fontSize: 14, color: '#555', marginBottom: 12 },
    option: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        marginTop: 8,
    },
    optionSelected: { borderColor: '#1e88e5', backgroundColor: '#e3f2fd' },
    optionLabel: { fontSize: 15, color: '#111' },
    optionLabelSelected: { color: '#1e88e5', fontWeight: '600' },
    otherInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 10,
        padding: 12,
        marginTop: 8,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
        justifyContent: 'flex-end',
    },
    btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
    btnGhost: { backgroundColor: '#f0f0f0' },
    btnGhostText: { color: '#333', fontWeight: '600' },
    btnPrimary: { backgroundColor: '#d32f2f' },
    btnPrimaryText: { color: '#fff', fontWeight: '700' },
    btnDisabled: { opacity: 0.45 },
});
