import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import WS from './src/components/ws';

const App = () => {
    return (
        <>
            <StatusBar style="auto" />
            <View style={styles.container}>
                <WS />
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default App;
