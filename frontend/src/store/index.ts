import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import { persistMiddleware } from './persistMiddleware';
import { rootReducer } from './rootReducer';

export const store = configureStore({
    reducer: rootReducer,
    middleware: getDefault =>
        getDefault({
            serializableCheck: {
                // envelope carries ISO strings; no Date objects. Safe.
                ignoredActions: ['app/hydrate'],
            },
        }).prepend(persistMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
