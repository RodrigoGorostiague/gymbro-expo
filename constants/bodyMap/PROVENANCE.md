# Body geometry

Source: https://github.com/HichamELBSI/react-native-body-highlighter

Pinned commit: `8ed39ac2ae9cb46fb79d77eedec7e5b029a75174`.

Copied assets/bodyFront.ts, bodyBack.ts, bodyFemaleFront.ts and bodyFemaleBack.ts. Only imports/types adapted; geometry retained. Copyright (c) 2022 ELABBASSI Hicham, MIT; full license in LICENSE. No runtime dependency on the upstream component.

`bounds.json` contains curve bounds derived from these exact SVG paths with fontTools svgLib.path.parse_path and BoundsPen. It is used only to crop isolated muscle glyphs; both left and right paths remain unchanged. Regenerate bounds whenever source geometry changes.
