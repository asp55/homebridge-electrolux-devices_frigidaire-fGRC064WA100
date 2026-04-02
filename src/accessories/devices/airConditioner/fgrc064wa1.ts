import {
    PlatformAccessory,
    CharacteristicValue,
    Service,
    PartialAllowingNull,
    CharacteristicProps
} from 'homebridge';
import { ElectroluxDevicesPlatform } from '../../../platform';
import { Appliance } from '../../../definitions/appliance';
import _ from 'lodash';
import { ElectroluxAccessoryController } from '../../controller';
import { ApplianceItem } from '../../../definitions/appliances';
import { ApplianceState, Mode } from '../../../definitions/applianceState';

function FtoC(F) {
    return (F - 32) / 1.8;
}

function CtoF(C) {
    return C * 1.8 + 32;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Fgrc064wa1 extends ElectroluxAccessoryController {
    private service: Service;

    constructor(
        readonly _platform: ElectroluxDevicesPlatform,
        readonly _accessory: PlatformAccessory<ElectroluxAccessoryController>,
        readonly _item: ApplianceItem,
        readonly _state: ApplianceState,
        readonly _appliance: Appliance
    ) {
        super(_platform, _accessory, _item, _state, _appliance);

        this.accessory
            .getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(
                this.platform.Characteristic.Manufacturer,
                'Electrolux'
            )
            .setCharacteristic(
                this.platform.Characteristic.Model,
                this.appliance.applianceInfo.model
            )
            .setCharacteristic(
                this.platform.Characteristic.SerialNumber,
                this.item.applianceId
            );

        //Main Service (Heater/Cooler)
        this.service =
            this.accessory.getService(this.platform.Service.HeaterCooler) ||
            this.accessory.addService(this.platform.Service.HeaterCooler);

        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            this.item.applianceName
        );

        //Name
        this.service
            .getCharacteristic(this.platform.Characteristic.Name)
            .onGet(this.getCharacteristicValueGuard(this.getName.bind(this)));

        //Active
        this.service
            .getCharacteristic(this.platform.Characteristic.Active)
            .onGet(this.getCharacteristicValueGuard(this.getActive.bind(this)))
            .onSet(this.setCharacteristicValueGuard(this.setActive.bind(this)));

        //CurrentHeaterCoolerState
        this.service
            .getCharacteristic(
                this.platform.Characteristic.CurrentHeaterCoolerState
            )
            .setProps({
                validValues: [
                    this.platform.Characteristic.CurrentHeaterCoolerState
                        .INACTIVE,
                    this.platform.Characteristic.CurrentHeaterCoolerState.IDLE,
                    this.platform.Characteristic.CurrentHeaterCoolerState
                        .COOLING
                ]
            })
            .onGet(
                this.getCharacteristicValueGuard(
                    this.getCurrentHeaterCoolerState.bind(this)
                )
            );

        //TargetHeaterCoolerState
        this.service
            .getCharacteristic(
                this.platform.Characteristic.TargetHeaterCoolerState
            )
            .updateValue(
                this.platform.Characteristic.TargetHeaterCoolerState.COOL
            )
            .setProps({
                validValues: [
                    this.platform.Characteristic.TargetHeaterCoolerState.COOL
                ]
            })
            .onGet(
                this.getCharacteristicValueGuard(
                    this.getTargetHeaterCoolerState.bind(this)
                )
            )
            .onSet(
                this.setCharacteristicValueGuard(
                    this.setTargetHeaterCoolerState.bind(this)
                )
            );

        //CurrentTemperature
        this.service
            .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .onGet(
                this.getCharacteristicValueGuard(
                    this.getCurrentTemperature.bind(this)
                )
            );

        //CoolingThresholdTemperature
        this.service
            .getCharacteristic(
                this.platform.Characteristic.CoolingThresholdTemperature
            )
            .updateValue(this.state.properties.reported.targetTemperatureC)
            .setProps(this.coolingTemperatureThresholdProps.bind(this)())
            .onGet(
                this.getCharacteristicValueGuard(
                    this.getCoolingThresholdTemperature.bind(this)
                )
            )
            .onSet(
                this.setCharacteristicValueGuard(
                    this.setCoolingThresholdTemperature.bind(this)
                )
            );

        //TemperatureDisplayUnits
        this.service
            .getCharacteristic(
                this.platform.Characteristic.TemperatureDisplayUnits
            )
            .onGet(
                this.getCharacteristicValueGuard(
                    this.getTemperatureDisplayUnits.bind(this)
                )
            )
            .onSet(
                this.setCharacteristicValueGuard(
                    this.setTemperatureDisplayUnits.bind(this)
                )
            );
    }

    private coolingTemperatureThresholdProps(): PartialAllowingNull<CharacteristicProps> {
        if (
            this.state.properties.reported.temperatureRepresentation ===
                'fahrenheit' &&
            this.appliance.capabilities.targetTemperatureF
        ) {
            return {
                minValue: FtoC(
                    this.appliance.capabilities.targetTemperatureF.min
                ),
                maxValue: FtoC(
                    this.appliance.capabilities.targetTemperatureF.max
                ),
                minStep:
                    this.appliance.capabilities.targetTemperatureF.step / 1.8
            };
        }
        return {
            minValue: this.appliance.capabilities.targetTemperatureC?.min ?? 16,
            maxValue: this.appliance.capabilities.targetTemperatureC?.max ?? 32,
            minStep: this.appliance.capabilities.targetTemperatureC?.step ?? 1
        };
    }

    private setTemperature = _.debounce(async (value: CharacteristicValue) => {
        if (
            this.state.properties.reported.temperatureRepresentation ===
            'fahrenheit'
        ) {
            this.sendCommand({ targetTemperatureF: CtoF(value) });
        } else {
            this.sendCommand({ targetTemperatureC: value });
        }
    }, 1000);

    async getName(): Promise<CharacteristicValue> {
        return this.accessory.displayName;
    }

    async getActive(): Promise<CharacteristicValue> {
        return this.state.properties.reported.applianceState === 'running'
            ? this.platform.Characteristic.Active.ACTIVE
            : this.platform.Characteristic.Active.INACTIVE;
    }

    async setActive(value: CharacteristicValue) {
        const turnOn = value === this.platform.Characteristic.Active.ACTIVE;

        if (
            (this.state.properties.reported.applianceState === 'running' &&
                turnOn) ||
            (this.state.properties.reported.applianceState === 'off' && !turnOn)
        ) {
            return;
        }

        this.sendCommand({
            executeCommand: turnOn ? 'ON' : 'OFF'
        });

        this.state.properties.reported.applianceState = turnOn
            ? 'running'
            : 'off';
    }

    async getCurrentHeaterCoolerState(): Promise<CharacteristicValue> {
        switch (this.state.properties.reported.mode) {
            case 'cool':
                return this.platform.Characteristic.CurrentHeaterCoolerState
                    .COOLING;
            case 'eco':
                if (
                    this.state.properties.reported.ambientTemperatureC >
                    this.state.properties.reported.targetTemperatureC
                ) {
                    return this.platform.Characteristic.CurrentHeaterCoolerState
                        .COOLING;
                }

                return this.platform.Characteristic.CurrentHeaterCoolerState
                    .IDLE;
            case 'off':
                return (
                    this,
                    this.platform.Characteristic.CurrentHeaterCoolerState
                        .INACTIVE
                );
            default:
                return this.platform.Characteristic.CurrentHeaterCoolerState
                    .IDLE;
        }
    }

    async getTargetHeaterCoolerState(): Promise<CharacteristicValue> {
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
    }

    async setTargetHeaterCoolerState(value: CharacteristicValue) {
        let mode: Uppercase<Mode> | null = null;
        let currentState: CharacteristicValue | null = null;

        switch (value) {
            case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
                mode = 'COOL';
                currentState =
                    this.platform.Characteristic.CurrentHeaterCoolerState
                        .COOLING;
                break;
        }

        if (!mode) {
            return;
        }

        // Skipping actually sending the command mode to avoid overwriting the user's intended mode.
        // AC supports modes "Eco", "Cool", and "Fan Only") but homekit only supports "Cool" so
        // we'll report all modes as Cool
        //
        // await this.sendCommand({
        //     mode
        // });

        if (currentState) {
            this.service.updateCharacteristic(
                this.platform.Characteristic.CurrentHeaterCoolerState,
                currentState
            );

            switch (value) {
                case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
                    this.service.updateCharacteristic(
                        this.platform.Characteristic
                            .CoolingThresholdTemperature,
                        this.state.properties.reported.targetTemperatureC
                    );
                    break;
            }

            this.state.properties.reported.mode = mode as Mode;
        }
    }

    async getCurrentTemperature(): Promise<CharacteristicValue> {
        return this.state.properties.reported.ambientTemperatureC;
    }

    async getCoolingThresholdTemperature(): Promise<CharacteristicValue> {
        return this.state.properties.reported.targetTemperatureC;
    }

    async setCoolingThresholdTemperature(value: CharacteristicValue) {
        try {
            await this.setTemperature(value);
            this.state.properties.reported.targetTemperatureC = value as number;
        } catch (err) {
            this.platform.log.error(JSON.stringify(err));
            throw new this.platform.api.hap.HapStatusError(
                this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
            );
        }
    }

    async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
        switch (this.state.properties.reported.temperatureRepresentation) {
            case 'fahrenheit':
                return this.platform.Characteristic.TemperatureDisplayUnits
                    .FAHRENHEIT;
            default:
                return this.platform.Characteristic.TemperatureDisplayUnits
                    .CELSIUS;
        }
    }

    async setTemperatureDisplayUnits(value: CharacteristicValue) {
        const temperatureRepresentation =
            value ===
            this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
                ? 'fahrenheit'
                : 'celcius';

        this.state.properties.reported.temperatureRepresentation =
            temperatureRepresentation;

        //Update settings for the temperature itself to ensure nice steps

        this.service
            .getCharacteristic(
                this.platform.Characteristic.CoolingThresholdTemperature
            )
            .setProps(this.coolingTemperatureThresholdProps.bind(this)());

        await this.sendCommand({
            temperatureRepresentation: temperatureRepresentation.toUpperCase()
        });
    }

    update(state: ApplianceState) {
        this.state = state;

        this.service.updateCharacteristic(
            this.platform.Characteristic.Active,
            this.state.properties.reported.applianceState === 'running'
                ? this.platform.Characteristic.Active.ACTIVE
                : this.platform.Characteristic.Active.INACTIVE
        );

        this.service.updateCharacteristic(
            this.platform.Characteristic.CurrentTemperature,
            this.state.properties.reported.ambientTemperatureC
        );

        this.service.updateCharacteristic(
            this.platform.Characteristic.CoolingThresholdTemperature,
            this.state.properties.reported.targetTemperatureC
        );

        this.service.updateCharacteristic(
            this.platform.Characteristic.TemperatureDisplayUnits,
            this.state.properties.reported.temperatureRepresentation ===
                'fahrenheit'
                ? this.platform.Characteristic.TemperatureDisplayUnits
                      .FAHRENHEIT
                : this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS
        );
    }
}
