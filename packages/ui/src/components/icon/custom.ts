/**
 * Icons that Central does not carry, drawn into the same 24×24 box so they go
 * through `Icon` like everything else. Foreign marks come with their own
 * padding, so each one is scaled so its glyph spans about 17 of the 24 units,
 * the optical size of a Central icon. Brand marks only; the artwork is the
 * brand's own. Referenced names are emitted into `paths.ts` by the generator.
 */
export const CUSTOM_ICON_PATHS: Record<string, string> = {
  IconResend:
    '<g transform="translate(12 12) scale(0.018889) translate(-900 -900)" fill="currentColor"><path d="M1000.46 450C1174.77 450 1278.43 553.669 1278.43 691.282C1278.43 828.896 1174.77 932.563 1000.46 932.563H912.382L1350 1350H1040.82L707.794 1033.48C683.944 1011.47 672.936 985.781 672.935 963.765C672.935 932.572 694.959 905.049 737.161 893.122L908.712 847.244C973.85 829.812 1018.81 779.353 1018.81 713.298C1018.8 632.567 952.745 585.78 871.095 585.78H450V450H1000.46Z"/></g>',
};
