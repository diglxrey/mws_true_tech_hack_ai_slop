;(function () {
  var TAG = "sn-snippet"
  function originFromScript() {
    var cur = document.currentScript
    if (cur && cur.src) {
      try {
        return new URL(cur.src).origin
      } catch (e) {}
    }
    return location.origin
  }
  function themeMap(key) {
    var m = {
      theme: "_theme",
      bg: "_bg",
      color: "_color",
      accent: "_accent",
      font: "_font",
      "font-size": "_font_size",
      radius: "_radius",
      padding: "_padding",
    }
    return m[key]
  }
  function collectContext(el) {
    var ctx = {}
    var theme
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i]
      var n = a.name
      var v = a.value
      if (n === "slug") continue
      if (n === "data-loading" || n === "data-error") continue
      if (n.indexOf("data-") === 0) {
        var dk = n.slice(5)
        if (dk === "theme") {
          theme = v
          continue
        }
        var qk = themeMap(dk)
        if (qk) ctx[qk] = v
        continue
      }
      ctx[n] = v
    }
    return { ctx: ctx, theme: theme }
  }
  function queryFrom(slug, parsed) {
    var p = []
    var k
    for (k in parsed.ctx) {
      if (Object.prototype.hasOwnProperty.call(parsed.ctx, k)) {
        p.push(encodeURIComponent(k) + "=" + encodeURIComponent(parsed.ctx[k]))
      }
    }
    if (parsed.theme) p.push("_theme=" + encodeURIComponent(parsed.theme))
    return p.length ? "?" + p.join("&") : ""
  }
  function htmlToShadow(html) {
    var parser = new DOMParser()
    var doc = parser.parseFromString(html, "text/html")
    var scripts = doc.querySelectorAll("script")
    var j
    for (j = 0; j < scripts.length; j++) scripts[j].parentNode.removeChild(scripts[j])
    var styles = doc.querySelectorAll("head style")
    var headHtml = ""
    for (j = 0; j < styles.length; j++) headHtml += styles[j].outerHTML
    return headHtml + doc.body.innerHTML
  }
  function SnippetEl() {
    return HTMLElement.apply(this, arguments)
  }
  SnippetEl.prototype = Object.create(HTMLElement.prototype)
  SnippetEl.prototype.constructor = SnippetEl
  SnippetEl.prototype.connectedCallback = function () {
    var self = this
    if (!this._mo) {
      this._mo = new MutationObserver(function () {
        self._schedule()
      })
      this._mo.observe(this, { attributes: true })
    }
    this._schedule()
  }
  SnippetEl.prototype.disconnectedCallback = function () {
    if (this._mo) {
      this._mo.disconnect()
      this._mo = null
    }
  }
  SnippetEl.prototype._schedule = function () {
    var self = this
    clearTimeout(this._t)
    this._t = setTimeout(function () {
      self._load()
    }, 0)
  }
  SnippetEl.prototype._load = function () {
    var self = this
    var slug = self.getAttribute("slug")
    if (!slug) {
      self._showErr("missing slug")
      return
    }
    var parsed = collectContext(self)
    var loading = self.getAttribute("data-loading") || "Loading…"
    var errText = self.getAttribute("data-error") || "Load error"
    if (!self.shadowRoot) self.attachShadow({ mode: "open" })
    self.shadowRoot.innerHTML = "<span class=\"sn-loading\">" + loading + "</span>"
    var url = originFromScript() + "/embed/" + encodeURIComponent(slug) + queryFrom(slug, parsed)
    fetch(url, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status))
        return r.text()
      })
      .then(function (html) {
        self.shadowRoot.innerHTML = htmlToShadow(html)
        self.dispatchEvent(new CustomEvent("sn:load", { detail: { slug: slug } }))
      })
      .catch(function (e) {
        self._showErr(errText)
        self.dispatchEvent(new CustomEvent("sn:error", { detail: { message: String(e && e.message) } }))
      })
  }
  SnippetEl.prototype._showErr = function (msg) {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" })
    this.shadowRoot.innerHTML = "<span class=\"sn-error\">" + msg + "</span>"
  }
  SnippetEl.prototype.refresh = function () {
    this._load()
  }
  SnippetEl.prototype.setContext = function (obj) {
    var self = this
    Object.keys(obj || {}).forEach(function (k) {
      self.setAttribute(k, String(obj[k]))
    })
  }
  customElements.define(TAG, SnippetEl)
})()
