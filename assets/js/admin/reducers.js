import { combineReducers } from "redux";

import globalFABReducer from "./slices/global-fab";
import categoriesReducer from "./slices/categories";
import tagsReducer from "./slices/tags";
import pushArticleReducer from "./slices/push-article";
import articlesReducer from "./slices/articles";
import redirectionsReducer from "./slices/redirections";
import settingsReducer from "./slices/settings";

export default combineReducers({
  globalFAB: globalFABReducer,
  categories: categoriesReducer,
  tags: tagsReducer,
  pushArticle: pushArticleReducer,
  articles: articlesReducer,
  redirections: redirectionsReducer,
  settings: settingsReducer
});
