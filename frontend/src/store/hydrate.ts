import { createAction } from '@reduxjs/toolkit';
import type { PersistedShape } from './persistence';

export const hydrateFromStorage = createAction<PersistedShape>('app/hydrate');
