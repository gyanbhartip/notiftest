import {
    NavigationContainer,
    type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { OfferOverlay } from '../offer/OfferOverlay';
import { PresenceToggle } from '../presence/PresenceToggle';
import { useAppSelector } from '../store';
import { JobDetailsScreen } from './JobDetailsScreen';

export type RootStackParamList = {
    Home: undefined;
    JobDetails: { offer_id?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
    prefixes: ['notiftest://'],
    config: {
        screens: {
            Home: '',
            JobDetails: 'offer/:offer_id',
        },
    },
};

const HomeScreen = () => {
    const activeOfferId = useAppSelector(s => s.offer.activeOffer?.offer_id);
    const presence = useAppSelector(s => s.presence.intent);
    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.h1}>notiftest</Text>
            <Text style={styles.muted}>presence: {presence}</Text>
            <Text style={styles.muted}>
                active offer: {activeOfferId ?? 'none'}
            </Text>
            <PresenceToggle />
        </SafeAreaView>
    );
};

export const RootNavigator = () => (
    <NavigationContainer linking={linking}>
        <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
        </Stack.Navigator>
        <OfferOverlay />
    </NavigationContainer>
);

const styles = StyleSheet.create({
    container: { padding: 20, gap: 8 },
    h1: { fontSize: 24, fontWeight: '700' },
    muted: { color: '#666' },
});
