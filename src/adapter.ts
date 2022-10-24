import * as diasend from "./diasend";
import axios from "axios";
import store from "./store"

export const nightscout = axios.create({
    baseURL: process.env.NIGHTSCOUT_API,
    params: {
        token: process.env.NIGHTSCOUT_TOKEN,
    },
})
const DAY = 1000 * 60 * 60 * 24;
const PULL_PERIOD = DAY * 30;
const APP = "camaps-diasend-bridge"

export async function reliableApiRequest(from?: Date, to?: Date, allowCache = true): Promise<diasend.DiasendCGMResponse> {
    //Make sure to refresh the token if the first call with cache fails or propagate the error
    return diasend.obtainDiasendAccessToken(allowCache)
        .then(token => diasend.getPatientData(token.access_token, from, to))
        .catch(err => {
            if (!allowCache) throw err;
            return reliableApiRequest(from, to, false);
        })
}

async function getYPSO(from?: Date, to?: Date) {
    return reliableApiRequest(from, to)
        .then(list => list.filter(pump => pump.device.model === "KidsAP Pump"))
}

export async function dateCascadeImport() {
    const future = new Date(Date.now() + DAY * 3)
    const ypso = await getYPSO(future, future);
    if (ypso.length == 0)
        throw new Error("[diasend utils] no ypso pump in records ... exit")

    let start = ypso.map(y => new Date(y.device.first_value_at)).reduce((a, b) => a > b ? b : a)
    let end = ypso.map(y => new Date(y.device.last_value_at)).reduce((a, b) => a > b ? a : b)

    if (store.last_cgm_at > start.getTime()) start = new Date(store.last_cgm_at);

    while (end > start) {
        let intermediate = new Date(start.getTime() + PULL_PERIOD)
        if (intermediate > end) intermediate = end
        await importData(start, intermediate);
        start = intermediate;
        store.last_cgm_at = start.getTime();
    }
}

export async function importData(from?: Date, to?: Date) {
    const ypso = await getYPSO(from, to)
    const data = ypso.map(y => y.data).flat()

    const carb = data.filter((d, idx) => d.type === "carb") as diasend.CarbRecord[]
    const cgm = data.filter(d => d.type === "glucose") as diasend.GlucoseRecord[]
    const bolus = data.filter(d => d.type === "insulin_bolus") as diasend.BolusRecord[]
    const basal = data.filter(d => d.type === "insulin_basal") as diasend.BasalRecord[]

    const entries = cgm.map(cgm => {
        const type = cgm.flags.some(f => f.description === "Calibration") ? "mbg" : "sgv";
        const date = new Date(cgm.created_at);
        return {
            type,
            [type]: cgm.value,
            dateString: date,
            date: date.getTime(),
            app: APP,
        }
    });

    const treatments = [
        ...basal.map((basal) => ({
            eventType: "Temp Basal",
            duration: 90,
            absolute: basal.value,
            enteredBy: APP,
            created_at: new Date(basal.created_at),
        })),
        ...bolus.map((bolus) => {
            //find combined boluses : Bolus type ezcarb
            const is_combined = bolus.flags.some(f => f.description === "Bolus type ezcarb");
            if (is_combined) {
                let idx = data.indexOf(bolus);
                let next = data.slice(idx).findIndex(p => p.type === "carb")

                if (next != -1) {
                    const combi = data[idx + next] as diasend.CarbRecord;
                    carb.splice(carb.indexOf(combi), 1)
                    return {
                        eventType: "Meal Bolus",
                        insulin: bolus.total_value,
                        carbs: combi.value,
                        enteredBy: APP,
                        created_at: new Date(combi.created_at),
                    }
                } else return;
            } else return {
                eventType: "Correction Bolus",
                insulin: bolus.total_value,
                enteredBy: APP,
                created_at: new Date(bolus.created_at),
            }
        }),
        ...carb.map((carb) => ({
            eventType: "Carb Correction",
            carbs: carb.value,
            enteredBy: APP,
            created_at: new Date(carb.created_at),
        })),
    ].filter(t => {
        if(!t) return false;
        if(t.created_at.getTime() <= store.last_treatment_at) return false;
        return true;
    });

    await nightscout.post("/treatments", treatments)
    await nightscout.post("/entries", entries)

    treatments.forEach(t => {
        if(!t) return;
        if (t.created_at.getTime() > store.last_treatment_at)
            store.last_treatment_at = t.created_at.getTime()
    })

    if (from)
        console.log("[adapter] performing import", { from, to })
    else
        console.log("[adapter] performing update ...", new Date())
}
