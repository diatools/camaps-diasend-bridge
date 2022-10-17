import * as adapter from './adapter';

const PULL_INTERVALL = 1000 * 60 * 2.5;
console.log(process.env.TZ);

(async () => {
    await adapter.dateCascadeImport()
    setInterval(
        () => adapter.importData(adapter.last_value_at, new Date()),
        PULL_INTERVALL
    )
})()