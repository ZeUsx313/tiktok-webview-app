import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

// تغيير صفحة البداية من هنا إن أردت (مثال: https://www.tiktok.com/explore)
const START_URL = 'https://www.tiktok.com/foryou';

// ---------------------------------------------------------------------------
// محرك منع التشغيل التلقائي (No-Autoplay Engine)
// الفكرة:
//  1) تعطيل أي استدعاء play() قادم من أكواد الموقع للفيديوهات غير المسموح بها.
//  2) إزالة خاصية autoplay من كل فيديو (الحالي والقادم عبر MutationObserver).
//  3) أي فيديو يبدأ التشغيل بدون إذن يتم إيقافه فوراً (play event gate).
//  4) الضغط باللمس على الفيديو (أو كرت الفيديو) هو الطريقة الوحيدة للسماح به.
//  5) عند إيقاف الفيديو يتم سحب الإذن — ليعمل فقط ما تضغط عليه فعلاً.
// ---------------------------------------------------------------------------
const NO_AUTOPLAY_JS = `
(function () {
  if (window.__noAutoplayInstalled) { return; }
  window.__noAutoplayInstalled = true;

  var realPlay = HTMLMediaElement.prototype.play;

  // 1) حجب play() ما لم يكن الفيديو مسموحاً به
  HTMLMediaElement.prototype.play = function () {
    if (this.getAttribute('data-na-allowed') === '1') {
      return realPlay.apply(this, arguments);
    }
    return Promise.reject(new DOMException('Autoplay is blocked', 'NotAllowedError'));
  };

  // 2) شبكة أمان: أي فيديو يبدأ بدون إذن يتم إيقافه
  document.addEventListener('play', function (e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO' && v.getAttribute('data-na-allowed') !== '1') {
      v.pause();
    }
  }, true);

  // 3) لمس المستخدم على الفيديو أو كرته هو الإذن الوحيد
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) { return; }
    var v = (t.tagName === 'VIDEO') ? t : t.closest('video');
    if (!v) {
      var card = t.closest('[data-e2e="feed-item"], article, [class*="DivItemContainer"], [class*="VideoCard"], [class*="video-card"], [class*="PlayerContainer"], [class*="playerContainer"]');
      if (card) { v = card.querySelector('video'); }
    }
    if (v) { v.setAttribute('data-na-allowed', '1'); }
  }, true);

  // 4) سحب الإذن بعد الإيقاف
  document.addEventListener('pause', function (e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO') { v.setAttribute('data-na-allowed', '0'); }
  }, true);

  // 5) تعطيل autoplay للفيديوهات الحالية والقادمة
  function tame(root) {
    try {
      if (!root) { return; }
      var vids = (root.tagName === 'VIDEO') ? [root] : (root.querySelectorAll ? root.querySelectorAll('video') : []);
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        v.autoplay = false;
        v.removeAttribute('autoplay');
        v.setAttribute('data-na-allowed', '0');
        if (!v.paused) { v.pause(); }
      }
    } catch (err) {}
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) { tame(added[j]); }
    }
  });
  mo.observe(document.documentElement || document, { childList: true, subtree: true });

  tame(document);
})();
true;
`;

// النطاقات التي تبقى داخل التطبيق — أي نطاق آخر يفتح في متصفح النظام
const ALLOWED_HOSTS = /(^|\.)(tiktok\.com|tiktokv\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|byteoversea\.com|musical\.ly)$/i;

function isTikTokUrl(url) {
  if (typeof url !== 'string') { return false; }
  const m = url.match(/^https?:\/\/([^/?#:]+)/i);
  if (!m) { return false; }
  return ALLOWED_HOSTS.test(m[1]);
}

// User Agent لمتصفح كمبيوتر (ويندوز كروم) — يجبر الموقع على عرض واجهة الديسكتوب
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// فرض عرض تخطيط الكمبيوتر: نستبدل meta viewport بعرض 1280px
// حتى يظهر تصميم الديسكتوب كاملاً مصغراً ليناسب الشاشة، مع السماح بالتكبير بالأصابع
const DESKTOP_VIEWPORT_JS = `
(function () {
  function fixViewport() {
    try {
      var metas = document.querySelectorAll('meta[name="viewport"]');
      for (var i = 0; i < metas.length; i++) { metas[i].remove(); }
      var m = document.createElement('meta');
      m.name = 'viewport';
      m.content = 'width=1280, user-scalable=yes';
      (document.head || document.documentElement).appendChild(m);
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixViewport);
  } else {
    fixViewport();
  }
})();
true;
`;

export default function App() {
  const webRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [errKey, setErrKey] = useState(0);

  // زر الرجوع في أندرويد: رجوع داخل الموقع قبل الخروج من التطبيق
  useEffect(() => {
    if (Platform.OS !== 'android') { return undefined; }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (webRef.current && canGoBack) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((nav) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  // الروابط الخارجية تفتح في متصفح النظام، ومحتوى تيك توك يبقى داخل التطبيق
  const onShouldStartLoadWithRequest = useCallback((req) => {
    if (isTikTokUrl(req.url)) { return true; }
    if (req.isTopFrame && typeof req.url === 'string' && /^https?:/i.test(req.url)) {
      Linking.openURL(req.url).catch(() => {});
      return false;
    }
    return true;
  }, []);

  const onOpenWindow = useCallback((e) => {
    const url = e && e.nativeEvent ? e.nativeEvent.targetUrl : null;
    if (!url) { return; }
    if (isTikTokUrl(url)) {
      webRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(url)}; true;`
      );
    } else if (/^https?:/i.test(url)) {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <WebView
        key={errKey}
        ref={webRef}
        source={{ uri: START_URL }}
        style={styles.web}
        userAgent={USER_AGENT}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
        pullToRefreshEnabled
        useWideViewPort
        loadWithOverviewMode
        setSupportZoom
        setSupportMultipleWindows={Platform.OS === 'android' ? false : true}
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        injectedJavaScriptBeforeContentLoaded={NO_AUTOPLAY_JS}
        injectedJavaScript={NO_AUTOPLAY_JS + '\n' + DESKTOP_VIEWPORT_JS}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onRenderProcessGone={() => setErrKey((k) => k + 1)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color="#FE2C55" size="large" />
          </View>
        )}
        renderError={() => (
          <View style={styles.center}>
            <Text style={styles.errorText}>تعذر تحميل الصفحة{'\n'}تحقق من اتصالك بالإنترنت</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setErrKey((k) => k + 1)}>
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 24,
  },
  retryBtn: {
    backgroundColor: '#FE2C55',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
