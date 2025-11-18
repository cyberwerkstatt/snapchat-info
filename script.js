const $ = id => document.getElementById(id);
const host = "snapchat-scraper2.p.rapidapi.com";

// Hilfsfunktionen
function formatBoolFlag(value) {
    if (value === null || value === undefined) return "–";
    return value ? "ja" : "nein";
}

function toIsoFromMsObj(obj) {
    if (!obj || obj.value === undefined || obj.value === null) return null;
    const n = Number(obj.value);
    if (!Number.isFinite(n)) return null;
    try {
        return new Date(n).toISOString();
    } catch {
        return null;
    }
}

function cleanCategory(id) {
    if (!id) return null;
    return id.replace(/^public-profile-category-v3-/, "").replace(/-/g, " ");
}

function collectMedia(stories, sourceLabel) {
    const result = [];
    if (!Array.isArray(stories)) return result;

    stories.forEach(story => {
        const storyTitle = story.storyTitle?.value || null;
        const storyId = story.storyId?.value || null;
        const snapList = story.snapList || [];
        snapList.forEach(snap => {
            const urls = snap.snapUrls || {};
            const mediaUrl = urls.mediaUrl || urls.mediaPreviewUrl?.value || null;
            const previewUrl = urls.mediaPreviewUrl?.value || mediaUrl || null;
            const tsSec = snap.timestampInSec?.value ? Number(snap.timestampInSec.value) : null;
            const tsMs = tsSec && Number.isFinite(tsSec) ? tsSec * 1000 : null;
            result.push({
                source: sourceLabel,
                storyTitle,
                storyId,
                snapIndex: snap.snapIndex,
                mediaUrl,
                previewUrl,
                timestampIso: tsMs ? new Date(tsMs).toISOString() : null,
                lat: snap.lat,
                lng: snap.lng
            });
        });
    });

    return result;
}

// JSON → logisch aufbereitete Profilinfos
function extractSnapProfile(json) {
    const pageProps = json?.data?.props?.pageProps;
    if (!pageProps) return null;

    const userProfile = pageProps.userProfile || {};
    // zwei mögliche Varianten: userInfo oder publicProfileInfo
    let u = userProfile.userInfo || userProfile.publicProfileInfo || null;
    if (!u) return null;

    // Username notfalls aus dem Seitentitel ziehen: "Celine … (@cheyenne123.4) | ..."
    let username = u.username || null;
    if (!username && pageProps.pageMetadata?.pageTitle) {
        const m = pageProps.pageMetadata.pageTitle.match(/\(@([^)]*)\)/);
        if (m) username = m[1];
    }

    const subscriberRaw = u.subscriberCount || null;
    let subscriberFormatted = null;
    if (subscriberRaw !== null && subscriberRaw !== undefined) {
        const n = Number(subscriberRaw);
        subscriberFormatted = Number.isFinite(n)
            ? n.toLocaleString("de-DE")
            : String(subscriberRaw);
    }

    const createdIso = toIsoFromMsObj(u.creationTimestampMs);
    const lastUpdateIso = toIsoFromMsObj(u.lastUpdateTimestampMs);

    const curatedMedia = collectMedia(pageProps.curatedHighlights, "Highlight");
    const spotlightMedia = collectMedia(pageProps.spotlightHighlights, "Spotlight");
    const allMedia = [...curatedMedia, ...spotlightMedia];

    return {
        username: username,
        displayName: u.displayName || u.title || null,
        snapcode: u.snapcodeImageUrl
            || pageProps.pageLinks?.snapcodeImageUrl
            || null,
        // Profilbild / Avatar
        avatar: u.profilePictureUrl
            || u.bitmoji3d?.avatarImage?.url
            || null,
        avatarFallback: u.bitmoji3d?.avatarImage?.fallbackUrl || null,
        // Titelbild / Hero-Image
        cover: u.squareHeroImageUrl
            || pageProps.linkPreview?.twitterImage?.url
            || null,
        profileUrl: pageProps.pageLinks?.snapchatCanonicalUrl
            || pageProps.pageLinks?.canonicalUrl
            || null,
        bio: u.bio || null,
        website: u.websiteUrl || null,
        address: u.address || null,
        subscriberCount: subscriberFormatted,
        subscriberCountRaw: subscriberRaw,
        categoryId: u.categoryStringId || null,
        subcategoryId: u.subcategoryStringId || null,
        createdAt: createdIso,
        lastUpdateAt: lastUpdateIso,
        hasStory: u.hasStory,
        hasCuratedHighlights: u.hasCuratedHighlights,
        hasSpotlightHighlights: u.hasSpotlightHighlights,
        metaDescription: pageProps.pageMetadata?.pageDescription?.value || null,
        media: allMedia
    };
}

async function run() {
    let handle = $("q").value.trim();
    const key = $("key").value.trim();
    if (!key) return alert("Bitte RapidAPI Key eingeben.");
    if (!handle) return alert("Bitte Snapchat-Username oder URL eingeben.");

    // führendes @ entfernen (z. B. "@cheyenne123.4")
    handle = handle.replace(/^@/, "");

    // URL → Username extrahieren
    try {
        const u = new URL(handle);
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length) {
            const last = parts[parts.length - 1];
            // /add/username oder /@username
            handle = last.replace(/^@/, "").replace(/^add\//, "");
        }
    } catch (e) {
        // war keine URL, ist okay
    }

    $("out").style.display = "block";
    $("uname").textContent = handle;
    $("dname").textContent = "–";
    $("snapcode").textContent = "–";
    $("avatar").textContent = "–";
    $("bg").textContent = "–";
    $("plink").textContent = "–";
    $("bio").textContent = "–";
    $("website").textContent = "–";
    $("address").textContent = "–";
    $("category").textContent = "–";
    $("subcategory").textContent = "–";
    $("subs").textContent = "–";
    $("created").textContent = "–";
    $("lastupdate").textContent = "–";
    $("hasstory").textContent = "–";
    $("hascurated").textContent = "–";
    $("hasspotlight").textContent = "–";
    $("meta").textContent = "–";
    const mediaListEl = $("medialist");
    if (mediaListEl) mediaListEl.innerHTML = "";
    $("raw").textContent = "";

    const url = `https://${host}/api/v1/users/detail?username=${encodeURIComponent(handle)}`;

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-rapidapi-key": key,
                "x-rapidapi-host": host
            }
        });

        const text = await res.text();
        $("raw").textContent = text;

        let json;
        try { json = JSON.parse(text); } catch { json = {}; }

        if (!res.ok) {
            $("dname").textContent = `Fehler: HTTP ${res.status}`;
            return;
        }

        const u = extractSnapProfile(json);
        if (!u) {
            $("dname").textContent = "Kein Profil gefunden";
            return;
        }

        $("uname").textContent = u.username || handle;
        $("dname").textContent = u.displayName || "–";

        // Bio
        $("bio").textContent = u.bio || "–";

        // Website
        if (u.website) {
            const a = document.createElement("a");
            const href = u.website.match(/^https?:\/\//i)
                ? u.website
                : "https://" + u.website;
            a.href = href;
            a.textContent = u.website;
            a.target = "_blank";
            $("website").innerHTML = "";
            $("website").appendChild(a);
        } else {
            $("website").textContent = "–";
        }

        // Adresse
        $("address").textContent = u.address || "–";

        // Kategorie
        const cat = cleanCategory(u.categoryId);
        $("category").textContent = cat || "–";

        const subcat = cleanCategory(u.subcategoryId);
        $("subcategory").textContent = subcat || "–";

        // Abonnenten
        $("subs").textContent = u.subscriberCount
            || (u.subscriberCountRaw != null ? String(u.subscriberCountRaw) : "–");

        // Zeitstempel
        $("created").textContent = u.createdAt || "–";
        $("lastupdate").textContent = u.lastUpdateAt || "–";

        // Flags
        $("hasstory").textContent = formatBoolFlag(u.hasStory);
        $("hascurated").textContent = formatBoolFlag(u.hasCuratedHighlights);
        $("hasspotlight").textContent = formatBoolFlag(u.hasSpotlightHighlights);

        // Meta-Beschreibung
        $("meta").textContent = u.metaDescription || "–";

        // Snapcode
        if (u.snapcode) {
            const img = document.createElement("img");
            img.src = u.snapcode;
            img.alt = "Snapcode";
            img.className = "avatar";
            $("snapcode").innerHTML = "";
            $("snapcode").appendChild(img);
        }

        // Avatar
        if (u.avatar || u.avatarFallback) {
            const img = document.createElement("img");
            img.src = u.avatar || u.avatarFallback;
            img.alt = "Profilbild";
            img.className = "avatar";
            img.onerror = () => {
                if (u.avatarFallback) img.src = u.avatarFallback;
            };
            $("avatar").innerHTML = "";
            $("avatar").appendChild(img);
        }

        // Titelbild / Hero-Image
        if (u.cover) {
            const cover = document.createElement("img");
            cover.src = u.cover;
            cover.style.maxWidth = "100%";
            cover.style.borderRadius = "12px";
            cover.style.display = "block";
            $("bg").innerHTML = "";
            $("bg").appendChild(cover);
        }

        // Profil-Link
        if (u.profileUrl) {
            const a = document.createElement("a");
            a.href = u.profileUrl;
            a.textContent = u.profileUrl;
            a.target = "_blank";
            $("plink").innerHTML = "";
            $("plink").appendChild(a);
        }

        // Medienliste (Highlights + Spotlight)
        if (mediaListEl) {
            mediaListEl.innerHTML = "";
            if (u.media && u.media.length) {
                u.media.forEach((m, idx) => {
                    if (!m.mediaUrl && !m.previewUrl) return;
                    const item = document.createElement("div");
                    item.className = "media-item";

                    if (m.previewUrl || m.mediaUrl) {
                        const img = document.createElement("img");
                        img.src = m.previewUrl || m.mediaUrl;
                        img.alt = (m.storyTitle || "") + " #" + (m.snapIndex ?? idx);
                        item.appendChild(img);
                    }

                    const meta = document.createElement("div");
                    meta.className = "meta mono small";
                    const parts = [];
                    if (m.source) parts.push(m.source);
                    if (m.storyTitle) parts.push(m.storyTitle);
                    if (m.timestampIso) parts.push(m.timestampIso);
                    meta.textContent = parts.join(" | ");
                    item.appendChild(meta);

                    const openLink = document.createElement("a");
                    openLink.href = m.mediaUrl || m.previewUrl;
                    openLink.target = "_blank";
                    openLink.textContent = "Öffnen";
                    item.appendChild(openLink);

                    if (m.mediaUrl) {
                        const dlLink = document.createElement("a");
                        dlLink.href = m.mediaUrl;
                        const baseName = (u.username || "snap") + "-" + (idx + 1);
                        dlLink.download = baseName;
                        dlLink.textContent = "Download";
                        item.appendChild(dlLink);
                    }

                    mediaListEl.appendChild(item);
                });
            } else {
                mediaListEl.textContent = "Keine Medien in Highlights/Spotlight gefunden.";
            }
        }

    } catch (e) {
        $("dname").textContent = "Fehler bei Anfrage";
        $("raw").textContent = String(e);
    }
}

$("go").addEventListener("click", run);
$("q").addEventListener("keydown", e => { if (e.key === "Enter") run(); });
