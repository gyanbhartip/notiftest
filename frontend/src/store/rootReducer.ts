import { combineReducers } from '@reduxjs/toolkit';
import bootReducer from './bootSlice';
import offerReducer from './offerSlice';
import presenceReducer from './presenceSlice';

export const rootReducer = combineReducers({
    boot: bootReducer,
    offer: offerReducer,
    presence: presenceReducer,
});
