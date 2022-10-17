import * as diasend from "./diasend";
import axios from "axios";
import store from "./store"

const nightscout = axios.create({
    baseURL: process.env.NIGHTSCOUT_API,
    params: {
        token: process.env.NIGHTSCOUT_TOKEN,
    },
})
const DAY = 1000 * 60 * 60 * 24;
const PULL_PERIOD = DAY * 30;
const APP = "camaps-diasend-bridge"

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

export async function dateCascadeImport() {
    const future = new Date(Date.now() + DAY * 3)
    const ypso = await getYPSO(future, future);
    if (ypso.length == 0) 
        throw new Error("[diasend utils] no ypso pump in records ... exit")

    let end = ypso.map(y => new Date(y.device.last_value_at)).reduce((a,b) => a > b ? a : b)
    let start = ypso.map(y => new Date(y.device.first_value_at)).reduce((a,b) => a > b ? b : a)

    while (end > start) {
        let intermediate = new Date(start.getTime() + PULL_PERIOD)
        if (intermediate > end) intermediate = end
        await importData(start, intermediate);
        start = intermediate;
    }
}

export async function importData(from: Date, to: Date) {
    const ypso = await getYPSO(from, to)
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
        ...basal.map((basal) => ({
            eventType: "Temp Basal",
            duration: 30,
            absolute: basal.value,
            enteredBy: APP,
            created_at: new Date(basal.created_at),
        })),
        ...bolus.map((bolus) => {
            //find combined combined boluses : Bolus type ezcarb
            const is_combined = bolus.flags.some(f => f.description === "Bolus type ezcarb");
            let eventType, next;
            if (is_combined) {
                // bolus is combined ... find the next carb
                eventType = "Meal Bolus"
                let idx = data.indexOf(bolus);
                next = data[++idx];
                while (next.type !== "carb") next = data[++idx];
                //remove the found carb array
                carb.splice(carb.indexOf(next), 1)
            } else {
                eventType = "Correction Bolus"
            }

            return {
                eventType,
                carbs: next?.value,
                insulin: bolus.total_value,
                enteredBy: APP,
                created_at: new Date(bolus.created_at),
            }
        }),
        ...carb.map((carb) => ({
            eventType: "Meal Bolus",
            carbs: carb.value,
            enteredBy: APP,
            created_at: new Date(carb.created_at),
        })),
    ];

    await nightscout.post("/treatments", treatments)
    await nightscout.post("/entries", entries)

    ypso.forEach(y => {
        const lva = new Date(y.device.last_value_at).getTime;
        if (lva > store.last_value_at) store.last_value_at = lva
    })

    console.log("[adapter] performing import", { from, to })
}
