import { Comfort600 } from '../accessories/devices/airConditioner/comfort600';
import { Fgrc064wa1 } from '../accessories/devices/airConditioner/fgrc064wa1';
import { WellA7 } from '../accessories/devices/airPurifier/wellA7';
import { PureA9 } from '../accessories/devices/airPurifier/pureA9';
import { UltimateHome500 } from '../accessories/devices/airPurifier/ultimateHome500';
import { AirPurifier } from '../accessories/devices/airPurifier/airPurifier';

export const DEVICES = {
    /* Air conditioners */
    Azul: Comfort600,
    AC: Fgrc064wa1,

    /* Air purifiers */
    WELLA7: WellA7,
    WELLA5: AirPurifier,
    PUREA9: PureA9,
    Muju: UltimateHome500
};
