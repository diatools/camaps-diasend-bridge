import * as diasend from "./diasend";
import { createProfile } from "./profile";
import { nightscout } from "./adapter";

diasend.getAuthenticatedScrapingClient()
    .then(async ({client, userId}) => {
        const settings = await diasend.getPumpSettings(client, userId);
        const profile = createProfile(settings)

        console.log(profile);

        nightscout.put("/profile", profile)
    })