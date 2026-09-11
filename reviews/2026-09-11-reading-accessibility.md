# Reading and accessibility controls

Shared Chinese/English preferences dialog on marketing pages and the web app. Text sizes: 100, 125, 150, 200 percent; optional reduced motion, local persistence, reset and modal focus return. Converted explicit font-size px values to rem without changing default size. Large text reflows app navigation and form controls. Browser zoom remains enabled.

Browser checked 200% root size (32px), homepage and web app without page-wide overflow at 1280px, setting persistence across navigation, named dialog/fields, focus return, reset and English labels. Initial visual check identified clipped filter heights and narrow app sidebar; adjusted auto heights and large-text navigation layout. Build, syntax and 19 existing data/cache regression tests passed. These tests do not certify accessibility conformance. VoiceOver/TalkBack and physical mobile-device testing remain outstanding.
