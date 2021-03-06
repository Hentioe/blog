import React from "react";
import { connect } from "react-redux";
import { initGFAB } from "../slices/global-fab";
import { PageComponent } from "../lib/page";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "../actions";

const initialEditCategory = {
  id: 0,
  name: "",
  slug: "",
  description: ""
};

class Categories extends PageComponent {
  constructor(props) {
    super(props);
    this.state = {
      editintAt: 0,
      editingCategory: Object.assign({}, initialEditCategory)
    };
  }

  componentDidMount() {
    super.componentDidMount();
    const { dispatch } = this.props;
    dispatch(initGFAB());
    dispatch(fetchCategories());
  }

  componentDidUpdate(prevProps, prevState, _snapshot) {
    let { editintAt } = this.state;
    let { isCreating } = this.props;
    // 更新编辑区域
    if (prevState.editintAt !== editintAt) M.updateTextFields();
    // 重置正在编辑数据
    if (prevProps.isCreating !== isCreating && !isCreating) {
      this.setState({
        editintAt: editintAt - 1,
        editingCategory: Object.assign({}, initialEditCategory)
      });
    }
  }

  handleDelete = (id, e) => {
    e.preventDefault();
    const { dispatch } = this.props;
    dispatch(deleteCategory(id));
  };

  handleCancelEdit = e => {
    e.preventDefault();
    this.setState({
      editintAt: 0,
      editingCategory: Object.assign({}, initialEditCategory)
    });
  };

  handlePush = e => {
    e.preventDefault();
    let { editintAt, editingCategory } = this.state;
    let { dispatch } = this.props;
    if (editintAt <= 0) {
      // 添加
      dispatch(createCategory(editingCategory));
    } else {
      dispatch(updateCategory(editingCategory));
    }
  };

  handleNameChange = e => {
    this.setState({
      editingCategory: Object.assign(this.state.editingCategory, {
        name: e.target.value
      })
    });
  };

  handleSlugChange = e => {
    this.setState({
      editingCategory: Object.assign(this.state.editingCategory, {
        slug: e.target.value.toLowerCase()
      })
    });
  };

  handleDescriptionChange = e => {
    this.setState({
      editingCategory: Object.assign(this.state.editingCategory, {
        description: e.target.value
      })
    });
  };

  handleEdit = (editintAt, e) => {
    e.preventDefault();
    let editingCategory = Object.assign(
      {},
      this.props.items.filter(c => c.id == editintAt)[0]
    );
    this.setState({ editintAt, editingCategory });
    this.scrollToTop();
  };

  render() {
    let { isLoaded, isCreating, deletingAt, items } = this.props;
    let { editintAt, editingCategory } = this.state;
    return (
      <div className="container">
        <div className="section">
          <div className="row">
            <div className="col s12 m6">
              <div className="card">
                <div className="card-conent">
                  <div className="row">
                    <div className="input-field col s6">
                      <input
                        id="edit_name"
                        type="text"
                        onChange={this.handleNameChange}
                        value={editingCategory.name}
                      />
                      <label htmlFor="edit_name">名称</label>
                    </div>
                    <div className="input-field col s6">
                      <input
                        id="edit_name"
                        type="text"
                        onChange={this.handleSlugChange}
                        value={editingCategory.slug}
                      />
                      <label htmlFor="edit_name">SLUG</label>
                    </div>
                    <div className="input-field col s12">
                      <textarea
                        id="textarea1"
                        className="materialize-textarea"
                        onChange={this.handleDescriptionChange}
                        value={editingCategory.description}
                      ></textarea>
                      <label htmlFor="textarea1">描述</label>
                    </div>
                  </div>
                </div>
                <div className="card-action">
                  {!isCreating ? (
                    <>
                      <a href="#" onClick={this.handlePush}>
                        {editintAt <= 0 ? "添加" : "更新"}
                      </a>
                      {editintAt > 0 ? (
                        <a href="#" onClick={this.handleCancelEdit}>
                          取消
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <span>创建中……</span>
                  )}
                </div>
              </div>
            </div>
            {items.map(c => (
              <div key={c.id} className="col s12 m6">
                <div className="card blue-grey darken-1">
                  <div className="card-content white-text">
                    <span className="card-title">
                      {c.name} ({c.slug})
                    </span>
                    <p>{c.description}</p>
                  </div>
                  <div className="card-action white-text">
                    {isLoaded && deletingAt != c.id ? (
                      <>
                        <a href="#" onClick={e => this.handleEdit(c.id, e)}>
                          编辑
                        </a>
                        <a href="#" onClick={e => this.handleDelete(c.id, e)}>
                          删除
                        </a>
                      </>
                    ) : (
                      <span>操作按钮不可用</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => {
  return state.categories;
};

export default connect(mapStateToProps)(Categories);
