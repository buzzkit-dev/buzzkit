/**
 * Icons that Central does not carry, drawn into the same 24×24 box so they go
 * through `Icon` like everything else. Foreign marks come with their own
 * padding, so each one is scaled so its glyph spans about 17 of the 24 units,
 * the optical size of a Central icon. Brand marks only; the artwork is the
 * brand's own. Referenced names are emitted into `paths.ts` by the generator.
 */
export const CUSTOM_ICON_PATHS: Record<string, string> = {
  IconBuzzkit:
    '<g transform="scale(0.75)" fill="currentColor"><path d="M16 3.5c-4.97 0-8.5 3.8-8.5 8.75v4.1c0 1.1-.38 2.17-1.08 3.02l-1.5 1.83c-.9 1.1-.12 2.8 1.3 2.8h19.56c1.42 0 2.2-1.7 1.3-2.8l-1.5-1.83a4.77 4.77 0 0 1-1.08-3.02v-4.1C24.5 7.3 20.97 3.5 16 3.5Z"/><path d="M12.5 26.5a3.5 3.5 0 0 0 7 0h-7Z"/><path opacity="0.35" d="M26.75 6.25a1 1 0 0 1 1.4-.2 11.4 11.4 0 0 1 3.2 5.2 1 1 0 0 1-1.92.56 9.4 9.4 0 0 0-2.5-4.16 1 1 0 0 1-.18-1.4ZM5.25 6.25a1 1 0 0 0-1.4-.2 11.4 11.4 0 0 0-3.2 5.2 1 1 0 0 0 1.92.56 9.4 9.4 0 0 1 2.5-4.16 1 1 0 0 0 .18-1.4Z"/></g>',
  IconResend:
    '<g transform="translate(12 12) scale(0.018889) translate(-900 -900)" fill="currentColor"><path d="M1000.46 450C1174.77 450 1278.43 553.669 1278.43 691.282C1278.43 828.896 1174.77 932.563 1000.46 932.563H912.382L1350 1350H1040.82L707.794 1033.48C683.944 1011.47 672.936 985.781 672.935 963.765C672.935 932.572 694.959 905.049 737.161 893.122L908.712 847.244C973.85 829.812 1018.81 779.353 1018.81 713.298C1018.8 632.567 952.745 585.78 871.095 585.78H450V450H1000.46Z"/></g>',
};
