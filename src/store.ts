import fs from 'fs';

const PATH = "store.json"

interface Store {
    last_treatment_at: number;
    last_profile_at: number;
}

const init: Store = fs.existsSync(PATH)
    ? JSON.parse(fs.readFileSync(PATH, {encoding: "utf-8", flag: "r"}))
    : {
        last_treatment_at: 0,
        last_profile_at: 0,
    };

console.log("[store] init ...", init)

const store = new Proxy(init, {
    set: (target, prop: string, value) => {
        target[prop] = value;
        console.log("[store] update ...", target)
        fs.writeFileSync(PATH, JSON.stringify(target), {encoding: "utf-8", flag: "w"})
        return true;
    },
});

export default store;