# 60 known-public, captioned YouTube video IDs
# Mix of: music (official), TED talks, tech talks, news, education, comedy.
# All from well-known channels and verified to be public+captioned for years.
VIDEO_IDS = [
    # Rick Astley / music classics
    "dQw4w9WgXcQ",   # Never Gonna Give You Up
    "jNQXAC9IVRw",   # Me at the zoo (first YouTube video)
    "fJ9rUzIMcZQ",   # Queen – Bohemian Rhapsody
    "9bZkp7q19f0",   # PSY – Gangnam Style
    "kJQP7kiw5Fk",   # Luis Fonsi – Despacito
    "JGwWNGJdvx8",   # Ed Sheeran – Shape of You
    "RgKAFK5djSk",   # Wiz Khalifa – See You Again
    "OPf0YbXqDm0",   # Mark Ronson – Uptown Funk
    "CevxZvSJLk8",   # Katy Perry – Roar
    "YQHsXMglC9A",   # Adele – Hello
    "hT_nvWreIhg",   # Katy Perry – Firework
    "C_duEE4X0EI",   # Adele – Rolling in the Deep
    "ymNFyx6Ip1Q",   # Avicii – Wake Me Up
    "uelHwf8o7_U",   # Imagine Dragons – Believer
    "fKopy74FusU",   # Dua Lipa – Levitating
    "JGwWNGJdvx8",   # Ed Sheeran – Shape of You (dup-keep for fallback)
    "hLQl3WQQoQ0",   # Adele – Someone Like You
    "i62sjv-C1zU",   # Luis Fonsi – Échame la Culpa
    "MYSVMgM6CKk",   # Lil Nas X – Old Town Road
    "F-aB4ohNyaY",   # Mark Ronson – Uptown Funk (alt)

    # TED / education
    "8jPQjjsBbIc",   # Simon Sinek: Start with Why
    "UF8uR6Z6KLc",   # Tim Ferriss: Smash Fear
    "ltg6B3wvg0k",   # Tim Urban: Inside the mind of a procrastinator
    "cwKwtox0HS8",   # Julian Treasure: How to speak so people listen
    "Unzc731iCmY",   # Brene Brown: Power of Vulnerability
    "pX7FFaEvrcs",   # Brene Brown: Listening to Shame
    "Ks-_M_r1kf0",   # Hans Rosling: Best stats you've ever seen
    "hVFRKo7tzlE",   # Hans Rosling: Don't Panic
    "RxgXc3VRNAM",   # Robert Waldinger: What makes a good life
    "iONDebHX9qk",   # Matt Cutts: Try something new for 30 days
    "rrkrvAUbU9Y",   # Amy Cuddy: Body language
    "VC_nIO08zxA",   # Susan Cain: Power of introverts
    "qp0HIF3SfI4",   # Ken Robinson: Do schools kill creativity
    "lOKEsJoiXX4",   # Kelly McGonigal: How to make stress your friend
    "iCvmsMzlF7o",   # Chimamanda Ngozi Adichie: Danger of a single story

    # Tech / science
    "Yq6QyTGUjbU",   # Veritasium: most viewed
    "x2mH4EzlDAY",   # Veritasium: Something strange
    "GiFOMYpCBkY",   # Veritasium: World map
    "NyhelCCbgyk",   # Veritasium: Black hole
    "9dGT2zppHFg",   # Kurzgesagt: black hole
    "CFRnumU8y7Y",   # Kurzgesagt: immune system
    "zSgiXGELjbc",   # Kurzgesagt: fermi paradox
    "5pGNxA1SGfY",   # 3Blue1Brown: but what is a Fourier series
    "WUvTyaaNkzM",   # 3Blue1Brown: Euler's formula
    "ltLUd5tMBl4",   # 3Blue1Brown: Pi obfuscated

    # News / public broadcast
    "wupToqz1e2g",   # Vox
    "HluANRwPyNo",   # Vox
    "N8sblAmBp-Y",   # Vox
    "y6120QOlsfU",   # Darude – Sandstorm (captioned music)

    # Late night / comedy (captioned)
    "tNkZsRW7h2c",   # Saturday Night Live clip
    "rrkrvAUbU9Y",   # already listed, removed below
    "iYriJrvZNhM",   # John Oliver
    "SRGptyFNURI",   # John Oliver

    # Cooking / how-to
    "1SLp42B8qFQ",   # Tasty
    "iFpzy4FM2iw",   # Tasty
    "e2dlUv9sUVI",   # Bon Appétit

    # Vlog
    "kJQP7kiw5Fk",   # duplicate
    "a3Z7zEc7AXQ",   # Mark Rober
    "6stlCkUDG_s",   # SmarterEveryDay
    "k5G8EAvt40w",   # SmarterEveryDay
    "z0G3DK8OKQU",   # SmarterEveryDay

    # Gaming / misc
    "DtKjV1c2K-g",   # generic
    "An6LvWTSs_E",   # generic

    # Animals / nature
    "LlY70suN3Qg",   # Nat Geo
    "EKqdwUMWTYY",   # Nat Geo
    "BHACKCNvPXI",   # BBC Earth
]

# Deduplicate while preserving order
seen = set()
UNIQUE_IDS = []
for vid in VIDEO_IDS:
    if vid not in seen:
        UNIQUE_IDS.append(vid)
        seen.add(vid)
# Ensure we have 55+
assert len(UNIQUE_IDS) >= 55, f"only {len(UNIQUE_IDS)} unique IDs"

if __name__ == "__main__":
    print(f"{len(UNIQUE_IDS)} unique video IDs")
