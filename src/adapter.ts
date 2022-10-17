import * as diasend from "./diasend";
import axios from "axios";

const nightscout = axios.create({
    baseURL: process.env.NIGHTSCOUT_API,
    params: {
        token: process.env.NIGHTSCOUT_TOKEN,
    },
})
const DAY = 1000 * 60 * 60 * 24;
const PULL_PERIOD = DAY * 5;
const APP = "camaps-diasend-bridge"
export let last_value_at = new Date(0);

export async function reliableApiRequest(from: Date, to: Date, allowCache = true): Promise<diasend.DiasendCGMResponse> {
    //Make sure to refresh the token if the first call with cache fails or propagate the error
    return diasend.obtainDiasendAccessToken(allowCache)
        .then(token => diasend.getPatientData(token.access_token, from, to))
        .catch(err => {
            if (!allowCache) throw err;
            return reliableApiRequest(from, to, false);
        })
}

async function getYPSO(from: Date, to: Date) {
    return reliableApiRequest(from, to)
        .then(list => list.filter(pump => pump.device.model === "KidsAP Pump"))
}

async function getOldestEntry() {
    // query the api for a date in the future, to get devices without data
    const future = new Date(Date.now() + DAY * 3)
    const ypso = await getYPSO(future, future);
    if (ypso.length == 0) throw new Error("[diasend utils] no ypso pump in records ... exit")
    return new Date(Math.min(...ypso.map(y => new Date(y.device.first_value_at).getTime())));
}

export async function dateCascadeImport() {
    let end = new Date()
    let start = await getOldestEntry()
    while (end > start) {
        let intermediate = new Date(end.getTime() - PULL_PERIOD)
        if (intermediate < start) intermediate = start
        await importData(intermediate, end);
        end = intermediate;
    }
}

export async function importData(from: Date, to: Date) {
    const ypso = await getYPSO(from, to)
    ypso.forEach(y => {
        const lva = new Date(y.device.last_value_at);
        if (lva > last_value_at) last_value_at = lva
    })

    const data = ypso.map(y => y.data).flat()

    const carb = data.filter(d => d.type === "carb") as diasend.CarbRecord[]
    const cgm = data.filter(d => d.type === "glucose") as diasend.GlucoseRecord[]
    const bolus = data.filter(d => d.type === "insulin_bolus") as diasend.BolusRecord[]
    const basal = data.filter(d => d.type === "insulin_basal") as diasend.BasalRecord[]

    const entries = cgm.map(cgm => {
        const type = cgm.flags.some(f => f.description === "Calibration") ? "mbg" : "sgv";
        const date = new Date(cgm.created_at);
        return {
            type,
            [type]: cgm.value,
            dateString: date.toISOString(),
            date: date.getTime(),
            app: APP,
        }
    });

    const treatments = [
        ...basal.map((b) => ({
            eventType: "Temp Basal",
            duration: 30,
            absolute: b.value,
            enteredBy: APP,
            created_at: new Date(b.created_at).toISOString(),
        })),
        ...carb.map((b) => ({
            eventType: "Meal Bolus",
            carbs: b.value,
            enteredBy: APP,
            created_at: new Date(b.created_at).toISOString(),
        })),
        ...bolus.map((b) => ({
            eventType: "Correction Bolus",
            insulin: b.total_value,
            enteredBy: APP,
            created_at: new Date(b.created_at).toISOString(),
        })),
    ];

    await nightscout.post("/treatments", treatments)
    await nightscout.post("/entries", entries)

    console.log("[adapter] performing import", {from, to})
}
