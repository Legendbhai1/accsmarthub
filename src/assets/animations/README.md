# Bundled animations

Four LottieFiles animations, bundled locally rather than loaded from the
LottieFiles CDN. Local copies mean the animations render offline, cannot be
changed under us by a third party, and add no runtime dependency on an external
host.

Each file is the animation payload extracted from the official `.dotlottie`
download for the ID named below — byte-for-byte the creator's artwork, only
re-serialised as minified JSON so the lazily-imported chunk stays small.

| File | LottieFiles page | Creator | License |
| --- | --- | --- | --- |
| `add-to-cart.json` | <https://lottiefiles.com/free-animation/add-to-cart-WCwxTKlisi> | MD Abdur | Lottie Simple License |
| `shopping-bag.json` | <https://lottiefiles.com/free-animation/shopping-bag-WjAOPr7V8K> | Mahendra | Lottie Simple License |
| `order-confirmed.json` | <https://lottiefiles.com/free-animation/order-confirmed-Edkng7cpMO> | Mahendra | Lottie Simple License |
| `empty-box.json` | <https://lottiefiles.com/free-animation/empty-box-XtO1oiZwG6> | Nick | Lottie Simple License |

## Which ones are success signals

`add-to-cart`, `shopping-bag` and `order-confirmed` each mean "the flow
succeeded", so they may only be mounted once the server has agreed — see
`tests/animations.test.ts`. `empty-box` is neutral artwork with no outcome
attached, so it is the only one the page-transition overlay may use.

## License

All four are free animations published under the **Lottie Simple License
(FL 9.13.21)**, <https://lottiefiles.com/page/license>. That license grants
permission to download, reproduce, modify, publish, distribute and publicly
display the files, including commercially, provided any distribution carries
the same terms. Attribution is permitted to be omitted, though it is
encouraged — hence this file.

If these animations are ever redistributed as standalone assets (rather than
compiled into this application), this notice must travel with them.

## Adding another

1. Open the animation's LottieFiles page and read the `.dotlottie` URL out of
   the page source (`assets-v2.lottiefiles.com/...`).
2. Download it, unzip it, and take `animations/*.json`.
3. Minify that JSON into this directory and add a row to the table above.
