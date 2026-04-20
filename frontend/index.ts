import messaging from '@react-native-firebase/messaging';
import { registerRootComponent } from 'expo';
import App from './App';
import { onMessageReceived } from './src/service/fcm';

// MUST be registered at app entry (not inside a component) so it runs
// in the headless JS task when a data-only FCM arrives in background/quit.
messaging().setBackgroundMessageHandler(onMessageReceived);
messaging().onMessage(onMessageReceived);

registerRootComponent(App);
