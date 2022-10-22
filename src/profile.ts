import { AxiosInstance } from "axios";
import { load } from "cheerio";
import { PumpSettings, getAuthenticatedScrapingClient, getPumpSettings } from "./diasend";
import { nightscout } from "./adapter";
import store from "./store";

const APP = "camaps-diasend-bridge"

const toNSProfile = (profile: Array<[time: string, value: number]>) =>
    profile.map(([time, value]) => ({
        time: time.substring(0, 5),
        value,
        timeAsSeconds: 0,
    }))

export async function listPumpSettings(
    client: AxiosInstance,
    userId: string,
) {
    const { data } = await client.get<string>(
        `/reports/${userId}/insulin/pump-settings`,
        {
            params: {
                period: "arbitrary",
                starttime: "2021-01-01",
                endtime: new Date().toISOString().substring(0, 10),
            }
        }
    );

    const $ = load(data);

    const device_id = $("[name=device_id]").attr('value')
    const group_id = $("#device_setting_group_id")
        .children()
        .toArray()
        .map(e => ({
            startDate: new Date($(e).text()),
            id: $(e).attr('value'),
        }));

    return {
        device_id,
        group_id,
    }
}

export function createProfile(
    settings: PumpSettings,
    startDate: Date,
) {
    const target = toNSProfile(settings.autoModeTargetProfile);

    const profile_1 = {
        units: settings.units,
        dia: settings.insulinOnBoardDurationHours,
        carbs_hr: process.env.CARBS_ABSORPTION,
        delay: process.env.CARBS_ABSORPTION,
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
        created_at: startDate,
        app: APP,
    }
}

export const profileImport = () => getAuthenticatedScrapingClient()
    .then(async ({ client, userId }) => {
        const profiles = await listPumpSettings(client, userId);

        profiles.group_id.map(group => async () => {
            if (store.last_profile_at >= group.startDate.getTime()) return
            else store.last_profile_at = group.startDate.getTime();

            try {
                const settings = await getPumpSettings(group.startDate, client, userId, profiles.device_id as string, group.id as string)
                const profile = createProfile(settings, group.startDate)

                nightscout.put("/profile", profile)
                console.log("[profile] imported ...", group)
            } catch {
                console.log("[profile] ERROR ...", group)
            }
        }).reduce((promise, func) => promise.then(func), Promise.resolve())
    })