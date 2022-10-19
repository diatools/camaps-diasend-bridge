import { PumpSettings } from "./diasend"

const toNSProfile = (profile: Array<[time: string, value: number]>) =>
    profile.map(([time, value]) => ({
        time: time.substring(0, 5),
        value,
        timeAsSeconds: 0,
    }))

export function createProfile(settings: PumpSettings) {
    const startDate = new Date() //TODO
    const target = toNSProfile(settings.autoModeTargetProfile);

    const profile_1 = {
        units: settings.units,
        dia: settings.insulinOnBoardDurationHours, //TODO
        carbs_hr: process.env.CARBS_ABSORPTION, //TODO
        delay: process.env.CARBS_ABSORPTION, //TODO
        timezone: process.env.TZ,
        carbratio: toNSProfile(settings.insulinCarbRatioProfile),
        sens: toNSProfile(settings.insulinSensitivityProfile),
        basal: toNSProfile(settings.basalProfile),
        target_low: target,
        target_high: target,
        startDate: new Date(0),
    }

    return {
        defaultProfile: "Profile 1",
        store: {
            "Profile 1": profile_1,
        },
        startDate,
        mills: startDate.getTime(),
        units: settings.units,
        created_at: new Date()
    }
}