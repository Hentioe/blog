// Styles
import "../scss/user.scss";
// Polyfills
import "mdn-polyfills/CustomEvent";
import "mdn-polyfills/String.prototype.startsWith";
import "mdn-polyfills/Array.from";
import "mdn-polyfills/NodeList.prototype.forEach";
import "mdn-polyfills/Element.prototype.closest";
import "mdn-polyfills/Element.prototype.matches";
import "child-replace-with-polyfill";
import "url-search-params-polyfill";
import "formdata-polyfill";
import "classlist-polyfill";
// Phoenix
import "phoenix_html";
import { Socket } from "phoenix";
import LiveSocket from "phoenix_live_view";
// ./user/
import "./user/bulma-event";
import "./user/breathe";
import PageHook from "./user/page-hook";

import Prism from "prismjs";

class IndexPage extends PageHook {
  constructor() {
    super({ navbar_item: "/" });
  }
}
class ArticlePage extends PageHook {
  constructor() {
    super({ navbar_item: "/readding" });
  }

  mounted() {
    super.mounted();
    Prism.highlightAll();
  }
}
class NotFoundPage extends PageHook {
  constructor() {
    super({ navbar_item: "/readding" });
  }
}

class LoginPage extends PageHook {
  updated() {
    const c = this.getContainer();
    const token = c.getAttribute("data-token");
    if (token) {
      document.cookie = `token=${token};`;
      location.href = "/admin";
    }
  }
}

let Hooks = {
  IndexPage: new IndexPage(),
  ArticlePage: new ArticlePage(),
  ArticleItem: {
    mounted() {
      this.el.addEventListener("click", e => {
        if (e.target.tagName !== "A") {
          this.el.querySelector("a").click();
        }
      });
    }
  },
  NotFoundPage: new NotFoundPage(),
  LoginPage: new LoginPage()
};

let liveSocket = new LiveSocket("/live", Socket, { hooks: Hooks });
liveSocket.connect();
