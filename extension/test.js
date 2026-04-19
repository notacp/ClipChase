import { YoutubeTranscript } from "youtube-transcript";

(async () => {
    try {
        const ts = await YoutubeTranscript.fetchTranscript("4EsUaur0nsQ");
        console.log("length:", ts.length);
    } catch (e) {
        console.error(e);
    }
})();
