import { PoolType } from '../types';

export const poolTypeFromApi = {
    WEIGHTED: PoolType.Weighted,
    PHANTOM_STABLE: PoolType.ComposableStable,
    GYRO3: PoolType.Gyro3,
    GYRO2: PoolType.Gyro2,
    GYROE: PoolType.GyroE,
};
