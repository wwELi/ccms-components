import { Inject } from 'angular-es-utils/decorators';
import genResource from 'angular-es-utils/rs-generator';
import rowCellTemplate from './tpls/customer-row-cell.tpl.html';
import skuRowCellTemplate from './tpls/customer-sku-row-cell.tpl.html';
import emptyTpl from './tpls/customer-empty.tpl.html';
import cloneDeep from 'lodash.clonedeep';

import angular from 'angular';

@Inject('$ccTips', '$element', 'modalInstance', 'selectedData',
'shopInfoData', '$ccValidator', '$resource', '$scope', '$ccGrid', '$ccModal', '$ccGoodsSelector',
'$filter')

export default class GoodsSelectorCtrl {

	$onInit() {
		// 已选商品列表
		// this.selectedGoods = this._selectedData;

		// 店铺信息 -> 如果是 array, 说明需要显示店铺列表
		//         -> 如果是 object, 说明是单店铺
		//         -> 其它情况, 需要提示用户, 参数格式不正确

		this.isShowShopList = Array.isArray(this._shopInfoData);
		this.isTaobao = this.isShowShopList ? this._shopInfoData[0].plat === 'taobao' : this._shopInfoData.plat === 'taobao';
		// 店铺列表
		this.shopList = this.isShowShopList ? this._shopInfoData : [this._shopInfoData];
		// form 区域日期配置
		this.dateRange = {
			start: null,
			end: null,
			disabled: false,
			dateOnly: true
		};
		// 请求商品自自定义类目数据
		this.getShopCateGoriesList();
		// 获取商品标准类目列表
		this.getCategoriesList();
		// 商品状态
		this.statusList = [
			{
				'title': '不限',
				'value': null
			},
			{
				'title': '在架',
				'value': 'true'
			},
			{
				'title': '下架',
				'value': 'false'
			}
		];

		this.shopListFieldsMap = {
			valueField: 'shopId',
			displayField: 'shopName'
		};
		this.shopCategoriesFieldsMap = this.categoriesFieldsMap = this.propsPidFieldsMap = this.propsVidFieldsMap = {
			valueField: 'id',
			displayField: 'name'
		};
		this.statusListFieldsMap = {
			valueField: 'value',
			displayField: 'title'
		};

		this.initForm();

		this.selectedGoodsFormModel = cloneDeep(this.formModel);
		this.allGoodsFormModel = {};
		// 级联菜单 -> 商品标准类目 select 框 change
		this.categorySelectChange = (newValue, oldValue, itemIndex, item) => {
			if (this.formModel.categoriesId) {
				genResource(`/api/categories/${item.id}/properties`, false, null).get().$promise.then(res => {
					this.propsPidList = res.data;
					this.formModel.propsPid = this.propsPid;
				});
			} else {
				this.propsPidList = [];
				this.formModel.propsPid = null;
			}
		};
		// 级联菜单 -> 商品属性 select 框 change
		this.propSelectChange = (newValue, oldValue, itemIndex, item) => {
			if (this.formModel.propsPid) {
				this.propsVidList = this.propsPidList[itemIndex].values;
				this.formModel.propsVid = cloneDeep(this.propsVid);
			} else {
				this.propsVidList = [];
				this.formModel.propsVid = [];
			}
		};

		// form 区域价格校验
		this.validators = {
			/**
			 * 价格校验
			 * -> 只能输入数字或两位小数
			 * -> 前一个数字小于或者等于后一个数字
			 * -> 价格区间必须都写, 校验才生效
			 * */
			price: {
				msg: '价格只能填写正数或两位小数.',
				fn: (modelValue, viewValue) => {
					const value = modelValue || viewValue;
					return value ? (/^[0-9]+([.][0-9]{0,2}){0,1}$/).test(value) : !value;
				}
			},
			lowPrice: {
				msg: '价格前项值必须小于后项值',
				fn: (modelValue, viewValue) => {
					const value = modelValue || viewValue;
					const l = parseFloat(value);
					const h = parseFloat(this.formModel.maxPrice);
					if (!isNaN(l) && !isNaN(h)) {
						return l < h;
					}
					return true;
				}
			},
			highPrice: {
				msg: '价格后项值必须大于前项值',
				fn: (modelValue, viewValue) => {
					const value = modelValue || viewValue;
					const l = parseFloat(this.formModel.minPrice);
					const h = parseFloat(value);
					if (!isNaN(l) && !isNaN(h)) {
						return l < h;
					}
					return true;
				}
			},
			// 数字校验
			number: {
				msg: '请输入整数',
				fn: (modelValue, viewValue) => {
					const value = modelValue || viewValue;
					return value ? (/(^\s*$)|(^\d+$)/).test(value) : !value;
				}
			}
		};

		// 筛选
		this.search = isSelectedGoodsTab => {
			this._$ccValidator.validate(this.goodsSelectorForm).then(() => {
				console.log('校验成功!');
				if (!isSelectedGoodsTab) {
					this.transformParams();
					this.updateGrid();
				} else {
					console.log(this.formModel);
					this.selectedItems.forEach(item => {
						item.isHide = !this.isEntityMatched(item);
						// item.skus && item.skus.forEach(sku => {
						// 	sku.isHide = !this.isSkuMatched(sku);
						// });
					});
					this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
				}
			}, () => {
				console.log('校验失败!');
			});
		};
		// 重置表单，恢复初始值
		this.reset = formCtrl => {
			this._$ccValidator.setPristine(formCtrl);
			this.initForm();
		};
		// 点击 tab
		this.tabClick = text => {
			window.cloneDeep = cloneDeep;
			if (text === '已选商品') {
				this.isSelectedGoodsTab = true;
				this.allDateRangeModel = cloneDeep(this.dateRange);
				this.allGoodsFormModel = cloneDeep(this.formModel);
				this.handleFormChange(this.selectedDateRangeModel, this.selectedGoodsFormModel);
				this.selectedItems.forEach(item => {
					item.interceptName = this.characterInterCept(item.name, 15);
					item.skus && item.skus.length && item.skus.forEach(sku => {
						sku.interceptName = this.characterInterCept(sku.name, 15);
					});
				});
				this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
			} else {
				this.isSelectedGoodsTab = false;
				this.selectedDateRangeModel = cloneDeep(this.dateRange);
				this.selectedGoodsFormModel = cloneDeep(this.formModel);
				this.handleFormChange(this.allDateRangeModel, this.allGoodsFormModel);
				this.resInfo.list.forEach(item => {
					item.interceptName = this.characterInterCept(item.name, 17);
					item.skus && item.skus.length && item.skus.forEach(sku => {
						sku.interceptName = this.characterInterCept(sku.name, 17);
					});
				});
			}
		};
		// 全部商品->表格配置
		this._selectedData.forEach(item => {
			item.checked = true;
			item.partial = false;
			item.skus.forEach(sku => {
				sku.checked = true;
			});
		});
		this.selectedItems = [];
		// selectedItemsBuffer 保存 selectedItems 中数据的副本（深拷贝）。维护 selectedItems 中数据状态。
		// 用作返回上一页时进行数据 merge，保持全部商品 tab 和已选商品 tab 的商品状态（checked/unchecked/partial、extend）一致。
		this.selectedItemsBuffer = [];
		this.pagerGridOptions = {
			resource: this._$resource('/api/item'),
			response: null,
			queryParams: {
				pageNum: 1
			},
			columnsDef: [
				{
					field: 'id',
					displayName: '商品ID',
					align: 'left'
				},
				{
					field: 'quantity',
					displayName: '库存',
					align: 'left'
				},
				{
					field: 'price',
					displayName: '价格',
					align: 'left'
				},
				{
					field: 'outerId',
					displayName: '商家编码',
					align: 'left'
				}
			],
			headerTpl: '/src/components/goods-selector/tpls/customer-header.tpl.html',
			rowTpl: '/src/components/goods-selector/tpls/customer-row.tpl.html',
			footerTpl: '/src/components/goods-selector/tpls/customer-footer.tpl.html',
			emptyTipTpl: emptyTpl,
			transformer: res => {
				if (res['currentPage']) {
					res['pageNum'] = res['currentPage'];
					delete res['currentPage'];
				}
				if (res['data']) {
					res['list'] = res['data'];
					delete res['data'];
				}
				if (res['totalCount']) {
					res['totals'] = res['totalCount'];
					delete res['totalCount'];
				}
				this.resInfo = res;
				// 全部商品列表 -> 当页数改变的时候，更新列表中的商品状态，保持和已选商品状态一致。
				this.dataMerge(this.resInfo.list, this.selectedItemsBuffer);
				this.currentPageChecked = this.isAllChildrenSelected(this.resInfo.list);
				this.resInfo.list.forEach(item => {
					item.interceptName = this.characterInterCept(item.name, 17);
					item.skus && item.skus.length && item.skus.forEach(sku => {
						sku.interceptName = this.characterInterCept(sku.name, 17);
					});
				});
				return res;
			},
			pager: {
				pageSize: 10
			}
		};
		this.pagerGridOptions.rowCellTemplate = rowCellTemplate;
		this.pagerGridOptions.skuRowCellTemplate = skuRowCellTemplate;
		this.pagerGridOptions.selectedData = this.selectedItems;
		// 表格子行的展开和收起
		this.pagerGridOptions.handleTreeIcon = entity => {
			entity.extend = !entity.extend;
		};
		// 展开/折叠全部
		this.extendAll = (isExtend, data) => {
			data.forEach(item => {
				item.extend = isExtend;
			});
		};
		// checked 父亲, 所有孩子 checked,
		// 反之 unchecked 父亲, 所有孩子 unchecked
		this.pagerGridOptions.selectTreeRootItem = entity => {
			entity.checked = !entity.checked;
			entity.partial = false;
			entity.skus.forEach(item => {
				item.checked = entity.checked;
			});
			// 所有父亲状态为 checked， 表格上方的全选当页, 被 checked，反之，被 unchecked。
			this.currentPageChecked = this.isAllChildrenSelected(this.resInfo.list);

			// 将已选商品 push 到 selectedItems 中
			//    -> 如果父亲 checked 并且不存在于 selectedItems 数组中，则将父亲(包括sku数据)整体 push 到数组中；
			//    -> 如果父亲 unchecked 并且存在于 selectedItems 数组中，则将父亲这个整体删除
			//    -> 其它情况不处理
			let entityIndex = this.findEntity(this.selectedItems, entity);
			if (entity.checked && entityIndex === -1) {
				this.selectedItems.push(entity);
			}
			if (!entity.checked && entityIndex !== -1) {
				this.selectedItems.splice(entityIndex, 1);
			}
			this.getSelectedItemsBuffer();
		};
		// 孩子中的一部分 checked, 父亲半选 partial，全部孩子 checked, 父亲 checked
		this.pagerGridOptions.selectTreeLeafItem = (entity, sku) => {
			sku.checked = !sku.checked;
			entity.checked = this.isAllChildrenSelected(entity.skus);
			entity.partial = this.isSomeChildrenSelected(entity.skus);
			// 所有父亲状态为 checked， 表格上方的全选当页, 被 checked，反之，被 unchecked。
			this.currentPageChecked = this.isAllChildrenSelected(this.resInfo.list);

			// 将已选商品 push 到 selectedItems 中
			//    -> 如果父亲状态是 checked，且不存在于 selectedItems 中, 则将父亲(包括 sku) push 到 selectedItems 数组中；
			//    -> 如果父亲状态是 partial，且存在于 selectedItems 中，则用父亲(包括 sku)替换已存在 entity；
			//    -> 如果父亲状态是 unchecked，则将其从 selectedItems 中删除
			if (entity.checked) {
				if (this.findEntity(this.selectedItems, entity) === -1) {
					this.selectedItems.push(entity);
				}
			} else if (entity.partial) {
				let entityIndex = this.findEntity(this.selectedItems, entity);
				if (entityIndex !== -1) {
					this.selectedItems[entityIndex] = entity;
				} else {
					this.selectedItems.push(entity);
				}
			} else {
				let entityIndex = this.findEntity(this.selectedItems, entity);
				entityIndex !== -1 && this.selectedItems.splice(entityIndex, 1);
			}
			this.getSelectedItemsBuffer();
		};
		// 全选当页
		this.selectCurrentPageAll = () => {
			// currentPageChecked -> 全选当页 (true or false)
			this.currentPageChecked = !this.currentPageChecked;
			this.resInfo.list.forEach(item => {
				item.checked = this.currentPageChecked;
				item.partial = false;
				item.skus && item.skus.forEach(sku => {
					sku.checked = this.currentPageChecked;
				});
			});
			if (this.currentPageChecked) {
				this.resInfo.list.forEach(item => {
					if (this.findEntity(this.selectedItems, item) === -1) {
						this.selectedItems.push(item);
					}
				});
			} else {
				this.resInfo.list.forEach(item => {
					let targetIndex = this.findEntity(this.selectedItems, item);
					if (targetIndex !== -1) {
						this.selectedItems.splice(targetIndex, 1);
					}
				});
			}
			this.getSelectedItemsBuffer();
		};

		// 已选商品->表格配置
		this.selectedPagerGridOptions = {};
		for (let key in this.pagerGridOptions) {
			if (this.pagerGridOptions.hasOwnProperty(key)) {
				this.selectedPagerGridOptions[key] = this.pagerGridOptions[key];
			}
		}
		this.selectedPagerGridOptions.resource = null;
		this.selectedPagerGridOptions.externalData = this.selectedItems;
		this.selectedPagerGridOptions.transformer = null;
		this.selectedPagerGridOptions.pager = {
			pageNum: 1,
			pageSize: 10
		};

		// 移除父亲: 从已选商品中删除父亲（包括 sku）。
		// -> selectedItems 和 resInfo.list 是引用关系，因此为了保持状态一致，先改变即将删除的商品状态；
		// -> 然后将其 push 到 selectedItemsBuffer 中（如果已存在，则先删除再 push）。
		// -> 最后执行splice操作，删除该商品。
		this.selectedPagerGridOptions.removeTreeRootItem = entity => {
			let targetIndex = this.findEntity(this.selectedItems, entity);
			if (targetIndex !== -1) {
				this.resetRootItem(entity);
				this.updateSelectedItemsBuffer(entity);
				this.selectedItems.splice(targetIndex, 1);
			}
			// 刷新
			this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
			// 任意一个父亲被 remove 掉, 表格上方的全选当页, 被 unchecked
			this.currentPageChecked = this.isAllChildrenSelected(this.resInfo.list);
		};
		// 移除孩子: -> 如果部分孩子被移除，则将孩子状态置为 unchecked;
		//          -> 如果全部孩子被移除，则将孩子状态置为 unchecked; 并且删除父亲。
		//          -> selectedItems 和 resInfo.list 是引用关系，因此为了保持状态一致，在删除父亲之前先改变其状态；
		//          -> 然后将其 push 到 selectedItemsBuffer 中（如果已存在，则先删除再 push）。
		this.selectedPagerGridOptions.removeTreeLeafItem = (entity, sku) => {
			let entityIndex = this.findEntity(this.selectedItems, entity);
			let skuIndex = this.findEntity(this.selectedItems[entityIndex].skus, sku);
			if (skuIndex !== -1) {
				this.selectedItems[entityIndex].skus[skuIndex].checked = false;
				if (this.isAllChildrenRemoved(entity.skus)) {
					this.resetRootItem(entity);
					this.updateSelectedItemsBuffer(entity);
					this.selectedItems.splice(entityIndex, 1);
				} else {
					this.selectedItems[entityIndex].partial = true;
					this.selectedItems[entityIndex].checked = false;
					this.updateSelectedItemsBuffer(entity);
				}
			}
			// 刷新
			this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
			// 任意一个孩子被 remove 掉, 表格上方的全选当页, 被 unchecked
			this.currentPageChecked = this.isAllChildrenSelected(this.resInfo.list);
		};
		// 移除全部
		// -> selectedItems 和 resInfo.list 是引用关系，因此为了保持状态一致，在删除父亲之前先改变其状态；
		// -> 然后清空 selectedItemsBuffer
		this.removeAll = () => {
			this.selectedItems.forEach(entity => {
				this.resetRootItem(entity);
			});
			this.selectedItemsBuffer.splice(0, this.selectedItemsBuffer.length);
			this.selectedItems.splice(0, this.selectedItems.length);
			// 刷新
			this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
			// 表格上方的全选当页, 被 unchecked
			this.currentPageChecked = false;
		};

		// 表格数据来自于 externalData 时，分页操作
		let filteredData = [];
		const wrapGridData = (currentPage, pageSize, data) => {
			this.selectedPagerGridOptions.pager.pageNum = currentPage;
			this.selectedPagerGridOptions.pager.pageSize = pageSize;
			this.selectedPagerGridOptions.pager.totalPages = Math.ceil((data.length || 0) / pageSize);
			this.selectedPagerGridOptions.externalData = data.slice(pageSize * (currentPage - 1), pageSize * currentPage);
			return this.selectedPagerGridOptions;
		};
		this.selectedPagerGridOptions.onSearch = name => {
			const currentPage = 1;
			const pageSize = this.pager.pageSize;
			filteredData = this._$filter('filter')(this.selectedItems, name);
			this._$ccGrid.refresh(wrapGridData(currentPage, pageSize, filteredData));
		};
		this.selectedPagerGridOptions.onRefresh = opts => {
			const currentPage = opts.pager.pageNum;
			const pageSize = opts.pager.pageSize;
			const data = filteredData.length ? filteredData : this.selectedItems;
			this._$ccGrid.refresh(wrapGridData(currentPage, pageSize, data));
		};
		// 移除当页
		this.removeCurrentPage = () => {
			let removeData = this.selectedPagerGridOptions.externalData;
			removeData.forEach(item => {
				let targetIndex = this.findEntity(this.selectedItems, item);
				if (targetIndex !== -1) {
					this.resetRootItem(this.selectedItems[targetIndex]);
					this.updateSelectedItemsBuffer(this.selectedItems[targetIndex]);
					this.selectedItems.splice(targetIndex, 1);
				}
			});
			// 刷新
			this.selectedPagerGridOptions.onRefresh(this.selectedPagerGridOptions);
		};
	}
	// form 表单初始化
	initForm() {
		this.formModel = {
			platform: this.shopList[0].plat, // 平台
			shopId: this.shopList[0].shopId, // 店铺
			id: [], // 商品ID数组??????????
			name: null, // 商品名称模糊匹配
			shopCategoriesId: [], // shopCategories.id 店铺类目数组
			categoriesId: null, // categories.id 标准类目
			propsPid: null, // props.pid 属性ID
			propsVid: [], // props.vid 属性值ID
			status: this.statusList[0].value, // 状态, true 在架, false 不在架
			skusPropsVname: null, // skus.props.vname SKU属性值模糊匹配
			outerId: null, // 商品商家编码
			skusOuterId: null, // skus.outerId SKU 商家编码
			skusId: [], // skus.id SKUID数组-----------
			startListTime: null, // 上架时间起始值, Unix时间戳，毫秒
			endListTime: null, // 上架时间结束值, Unix时间戳，毫秒
			minPrice: null, // 商品价格下限
			maxPrice: null // 商品价格下限
		};
	}
	// 请求商品自自定义类目数据
	getShopCateGoriesList() {
		genResource('/api/shop_categories', false, null).get().$promise.then(res => {
			this.shopCategoriesList = res.data;
		});
	}
	// 请求商品标准类目数据
	getCategoriesList() {
		genResource('/api/categories', false, null).get().$promise.then(res => {
			this.categoriesList = res.data;
		});
	}
	// 查询条件的参数名以及参数值转换
	transformParams() {
		if (this.dateRange.start) {
			this.formModel.startListTime = Date.parse(this.dateRange.start);
		}
		if (this.dateRange.end) {
			this.formModel.endListTime = Date.parse(this.dateRange.end);
		}
		// 查询参数
		const queryCollection = this.pagerGridOptions.queryParams;
		// 将部分参数属性名的驼峰形式转换成以 '.' 连接的形式
		for (let prop in this.formModel) {
			if (this.formModel.hasOwnProperty(prop)) {
				switch (prop) {
					case 'skusId':
						queryCollection['skus' + '.' + 'id'] = this.formModel[prop];
						break;
					case 'skusOuterId':
						queryCollection['skus' + '.' + 'outerId'] = this.formModel[prop];
						break;
					case 'skusPropsVname':
						queryCollection['skus' + '.' + 'props' + '.' + 'vname'] = this.formModel[prop];
						break;
					case 'categoriesId':
						queryCollection['categories' + '.' + 'id'] = this.formModel[prop];
						break;
					case 'shopCategoriesId':
						queryCollection['shopCategories' + '.' + 'id'] = this.formModel[prop];
						break;
					case 'propsPid':
						queryCollection['props' + '.' + 'pid'] = this.formModel[prop];
						break;
					case 'propsVid':
						queryCollection['props' + '.' + 'vid'] = this.formModel[prop];
						break;
					default:
						queryCollection[prop] = this.formModel[prop];
				}
			}
		}
	}
	// 更新表格数据（数据从后端请求）
	//    -> update 全部商品中状态
	//    -> update 全选按钮
	updateGrid() {
		this._$ccGrid.refresh(this.pagerGridOptions).then(opts => {
			if (opts.data && opts.data.length) {
				this.dataMerge(opts.data, this.selectedItemsBuffer);
				this.currentPageChecked = this.isAllChildrenSelected(opts.data);
			}
		});
	}
	// 从集合中获取 entity 的 index, 找不到返回 -1
	findEntity(collection, entity) {
		return collection.findIndex(item => angular.equals(item.id, entity.id));
	}
	// 所有孩子状态都为 checked， 返回 true, 反之返回 false
	isAllChildrenSelected(children) {
		return children && children.every(child => {
			return child.checked;
		});
	}
	// 至少有一个孩子被选中（不包括全部孩子被选的情况）， 返回 true, 反之返回 false
	isSomeChildrenSelected(children) {
		return children && !this.isAllChildrenSelected(children) && children.some(child => {
			return child.checked || child.partial;
		});
	}
	// 所有孩子都被移除， 返回 true, 反之返回 false
	isAllChildrenRemoved(children) {
		return !(this.isAllChildrenSelected(children) || this.isSomeChildrenSelected(children));
	}
	// 将商品状态恢复成初始状态
	resetRootItem(entity) {
		entity.checked = false;
		entity.partial = false;
		entity.skus && entity.skus.forEach(sku => {
			sku.checked = false;
		});
	}
	// 获取 selectedItems 的副本 selectedItemsBuffer
	getSelectedItemsBuffer() {
		this.selectedItemsBuffer = [];
		this.selectedItems.forEach(item => {
			this.selectedItemsBuffer.push(cloneDeep(item));
		});
	}
	// 更新 selectedItems 的副本 selectedItemsBuffer
	updateSelectedItemsBuffer(entity) {
		let index = this.findEntity(this.selectedItemsBuffer, entity);
		if (index !== -1) {
			this.selectedItemsBuffer.splice(index, 1);
			this.selectedItemsBuffer.push(cloneDeep(entity));
		}
	}
	// merge->分页时进行页的切换时需要保持商品被选状态
	dataMerge(goodsArr, selectedGoodsArr) {
		for (let i = 0; i < goodsArr.length; i++) {
			for (let j = 0; j < selectedGoodsArr.length; j++) {
				if (goodsArr[i].id === selectedGoodsArr[j].id) {
					goodsArr[i] = cloneDeep(selectedGoodsArr[j]);
					break;
				}
			}
		}
	}
	// 超过17个字则隐藏多余字，显示 '...'
	characterInterCept(str, maxLength) {
		if (str.length > maxLength) {
			str = str.slice(0, maxLength) + '...';
		}
		return str;
	}
	// tab 切换时 form 表单处理
	handleFormChange(dateRangeModel, formModel) {
		this.dateRange = dateRangeModel;
		for (let attr in formModel) {
			if (formModel.hasOwnProperty(attr)) {
				if (attr !== 'propsPid' && attr !== 'propsVid') {
					this.formModel[attr] = cloneDeep(formModel[attr]);
				}
			}
		}
		this.propsPid = cloneDeep(formModel.propsPid);
		this.propsVid = cloneDeep(formModel.propsVid);
	}
	// 验证父亲是否匹配
	isEntityMatched(goods) {
		console.log(this.isShopMatched(goods.shopId));
		console.log('id:', this.isIdMatched(goods.id));
		console.log(this.isNameMatched(goods.name));
		console.log(this.isShopCategoriesIdMatched(goods.shopCategories));
		console.log(this.isCategoriesMatched(goods.categories));
		console.log(this.isPropsMatched(goods.props));
		console.log(this.isPropValueMatched(goods.props));
		console.log(this.isStatusMatched(goods.status));
		console.log(this.isOuterIdMatched(goods.outerId));
		console.log(this.isPriceMatched(goods.price));
		return this.isShopMatched(goods.shopId) && this.isStatusMatched(goods.status) && this.isPriceMatched(goods.price) && this.isNameMatched(goods.name) &&
			this.isOuterIdMatched(goods.outerId) && this.isShopCategoriesIdMatched(goods.shopCategories) &&
			this.isCategoriesMatched(goods.categories) &&
			this.isPropsMatched(goods.props) && this.isPropValueMatched(goods.props);
		// return this.isShopMatched(goods.shopId);
		// return this.isShopMatched(goods.shopId);
		// return this.isStatusMatched(goods.status);
		// return this.isPriceMatched(goods.price);
		// return this.isNameMatched(goods.name);
		// return this.isOuterIdMatched(goods.outerId);
		// return this.isShopCategoriesIdMatched(goods.shopCategories);
		// return this.isCategoriesMatched(goods.categories);
		// return this.isPropsMatched(goods.props);
		// return this.isPropValueMatched(goods.props);
	}
	// 商品id -> 精确查询
	isIdMatched(id) {
		let isMatched = false;
		if (this.formModel.id.length) {
			for (let i = 0; i < this.formModel.id.length; i++) {
				if (String(id) === this.formModel.id[i]) {
					isMatched = true;
					break;
				}
			}
		} else {
			isMatched = true;
		}
		return isMatched;
	}
	// 商品所属店铺 -> 精确查询
	isShopMatched(shopId) {
		return this.formModel.shopId === null || String(this.formModel.shopId) === String(shopId);
	}
	// 商品状态 -> 精确查询
	isStatusMatched(status) {
		console.log(status);
		return this.formModel.status === null || this.formModel.status === status;
	}
	// 价格 -> 精确查询
	isPriceMatched(price) {
		if (this.formModel.minPrice === null) {
			if (this.formModel.maxPrice !== null) {
				return price <= Number(this.formModel.maxPrice);
			} else {
				return true;
			}
		} else {
			if (this.formModel.maxPrice === null) {
				return price >= Number(this.formModel.minPrice);
			} else {
				return price >= Number(this.formModel.minPrice) && Number(price <= this.formModel.maxPrice);
			}
		}
	}
	// 商品标题 -> 模糊查询
	isNameMatched(name) {
		return this.formModel.name === null || name.search(this.formModel.name) !== -1;
	}
	// 商品商家编码 -> 模糊查询
	isOuterIdMatched(outerId) {
		console.log(outerId.search(this.formModel.outerId));
		return this.formModel.outerId === null || outerId.search(this.formModel.outerId) !== -1;
	}
	// 商品自定义类目(多选、数组) -> 模糊查询
	isShopCategoriesIdMatched(shopCategories) {
		let isMatched = false;
		if (this.formModel.shopCategoriesId.length) {
			for (let i = 0; i < this.formModel.shopCategoriesId.length; i++) {
				let id = this.formModel.shopCategoriesId[i];
				for (let j = 0; j < shopCategories.length; j++) {
					if (shopCategories[j].cid === id) {
						isMatched = true;
						break;
					}
				}
			}
		} else {
			isMatched = true;
		}
		return isMatched;
	}
	// 商品标准类目 -> 模糊查询
	isCategoriesMatched(categories) {
		let isMatched = false;
		if (this.formModel.categoriesId !== null) {
			for (let i = 0; i < categories.length; i++) {
				if (categories[i].cid.search(String(this.formModel.categoriesId)) !== -1) {
					isMatched = true;
					break;
				}
			}
		} else {
			isMatched = true;
		}
		return isMatched;
	}
	// 商品属性 -> 模糊查询
	isPropsMatched(props) {
		let isMatched = false;
		if (this.formModel.propsPid !== null) {
			for (let i = 0; i < props.length; i++) {
				if (props[i].pid.search(String(this.formModel.propsPid)) !== -1) {
					isMatched = true;
					break;
				}
			}
		} else {
			isMatched = true;
		}
		return isMatched;
	}
	// 属性值(数组、多选) -> 模糊查询
	isPropValueMatched(propsValue) {
		let isMatched = false;
		if (this.formModel.propsVid.length) {
			for (let i = 0; i < this.formModel.propsVid.length; i++) {
				let id = this.formModel.propsVid[i];
				for (let j = 0; j < propsValue.length; j++) {
					if (propsValue[j].vid === id) {
						isMatched = true;
						break;
					}
				}
			}
		} else {
			isMatched = true;
		}
		return isMatched;
	}
	// 验证商品 sku 是否匹配
	isSkuMatched(sku) {
		return this.isSkusOuterIdMatched(sku.outerId);
	};
	// SKU 商家编码 -> 模糊查询
	isSkusOuterIdMatched(skusOuterId) {
		return this.formModel.skusOuterId === null || skusOuterId.search(this.formModel.skusOuterId !== -1);
	}
}
