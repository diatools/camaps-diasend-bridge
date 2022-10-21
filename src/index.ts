import * as adapter from './adapter';
import * as profile from "./profile";
import store from './store';

const PULL_INTERVALL_CGM = 1000 * 60 * 2.5;
const PULL_INTERVALL_PUMP = 1000 * 60 * 60;
console.log(process.env.TZ);

(async () => {
    await adapter.dateCascadeImport();
    await profile.profileImport();

    setInterval(
        () => adapter.importData(),
        PULL_INTERVALL_CGM
    );

    setInterval(
        () => profile.profileImport(),
        PULL_INTERVALL_PUMP
    );
})()