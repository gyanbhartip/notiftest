import { useEffect, useState } from 'react';
import { useAppDispatch } from '../store';
import { offerCountdownExpired } from '../store/offerSlice';

export const useCountdown = (expiresAt: string | null): number => {
    const [remainingMs, setRemainingMs] = useState(0);
    const dispatch = useAppDispatch();

    useEffect(() => {
        if (!expiresAt) {
            setRemainingMs(0);
            return;
        }
        const target = Date.parse(expiresAt);
        const tick = () => {
            const ms = target - Date.now();
            const clamped = Math.max(0, ms);
            setRemainingMs(clamped);
            if (clamped <= 0) {
                dispatch(offerCountdownExpired());
            }
        };
        tick();
        const id = setInterval(tick, 200);
        return () => clearInterval(id);
    }, [expiresAt, dispatch]);

    return remainingMs;
};
