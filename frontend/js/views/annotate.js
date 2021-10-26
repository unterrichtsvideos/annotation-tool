/**
 *  Copyright 2012, Entwine GmbH, Switzerland
 *  Licensed under the Educational Community License, Version 2.0
 *  (the "License"); you may not use this file except in compliance
 *  with the License. You may obtain a copy of the License at
 *
 *  http://www.osedu.org/licenses/ECL-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an "AS IS"
 *  BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 *  or implied. See the License for the specific language governing
 *  permissions and limitations under the License.
 *
 */

/**
 * A module representing the main view to create anotation
 * @module views-annotate
 */
define(
    [
        "jquery",
        "underscore",
        "backbone",
        "i18next",
        "player-adapter",
        "views/annotate-tab",
        "views/category-modal",
        "views/scale-modal",
        "templates/annotate",
        "templates/annotate-tab-title",
        "templates/annotate-toggle-free-text-button",
        "roles",
        "access",
        "models/category"
    ],
    function (
        $,
        _,
        Backbone,
        i18next,
        PlayerAdapter,
        AnnotateTab,
        CategoryModal,
        ScaleModal,
        template,
        TabsButtonTemplate,
        toggleFreeTextButtonTemplate,
        ROLES,
        ACCESS,
        Category
    ) {
        "use strict";

        /**
         * List of default tabs, each object contains an id, name and an array of roles
         * @type {Object}
         */
        var DEFAULT_TABS = {
            ALL: {
                id: "all",
                name: i18next.t("annotate.categories.all"),
                filter: function (category) {
                    return !category.get("settings").createdAsMine || category.isMine();
                },
                roles: []
            },
            PUBLIC: {
                id: "public",
                name: i18next.t("annotate.categories.public"),
                filter: function (category) {
                    return !category.get("settings").createdAsMine;
                },
                roles: [ROLES.ADMINISTRATOR],
                attributes: {
                    access: ACCESS.PUBLIC,
                    settings: {
                        createdAsMine: false
                    }
                }
            },
            MINE: {
                id: "mine",
                name: i18next.t("annotate.categories.mine"),
                filter: function (category) {
                    return category.get("settings").createdAsMine && category.isMine();
                },
                roles: [ROLES.USER, ROLES.ADMINISTRATOR],
                attributes: {
                    access: ACCESS.PRIVATE,
                    settings: {
                        createdAsMine: true
                    }
                }
            }
        };

        /**
         * @constructor
         * @see {@link http://www.backbonejs.org/#View}
         * @memberOf module:views-annotate
         * @augments module:Backbone.View
         */
        var Annotate = Backbone.View.extend({
            /**
             * Events to handle by the annotate view
             * @type {map}
             */
            events: {
                "keyup #new-annotation": "maybeInsert",
                "click #insert": "insert",
                "keydown #new-annotation": "maybePause",
                "click #label-tabs-buttons a": "showTab",
                "change #editSwitch": "onSwitchEditModus",
                "click #toggle-free-text button": "toggleFreeTextAnnotations",
                "click .new-category-public": "createCategoryPublic",
                "click .new-category-mine": "createCategoryMine",
                "click .create-scale": "createScale",
                "click .edit-scales": "editScales"
            },

            /**
             * Template for tabs button
             * @type {HandlebarsTemplate}
             */
            tabsButtonTemplate: TabsButtonTemplate,

            /**
             * Define if the view is or not in edit modus.
             * @type {boolean}
             */
            editModus: false,

            /**
             * Map with all the category tabs
             * @type {map}
             */
            categoriesTabs: {},

            /**
             * The default tabs when switching in edit modus
             * @type {map}
             */
            DEFAULT_TAB_ON_EDIT: DEFAULT_TABS.MINE.id,

            /**
             * Layout configuration
             * @type {Object}
             */
            layout: {
                freeText: true,
                categories: true
            },

            /**
             * constructor
             * @param {PlainObject} attr Object literal containing the view initialization attributes.
             */
            initialize: function (attr) {
                var categories;

                // Set the current context for all these functions
                _.bindAll(
                    this,
                    "insert",
                    "changeTrack",
                    "addTab",
                    "onSwitchEditModus",
                    "switchEditModus",
                    "toggleFreeTextAnnotationPane",
                    "toggleStructuredAnnotations",
                    "createCategory"
                );

                // Parameter for stop on write
                this.continueVideo = false;

                this.$el.html(template());

                this.$el.find("#toggle-free-text").html(
                    toggleFreeTextButtonTemplate({
                        freeTextVisible: annotationTool.freeTextVisible
                    })
                );

                // New annotation input
                this.input = this.$el.find("#new-annotation");
                this.freeTextElement = this.$el.find("#input-container");
                this.categoriesElement = this.$el.find("#categories");
                this.tabsButtonsElement = this.$el.find("ul#label-tabs-buttons");
                this.tabsContainerElement = this.$el.find("div#label-tabs-contents");

                // Print selected track
                this.trackDIV = this.$el.find("span.currentTrack");
                this.changeTrack(annotationTool.selectedTrack);

                this.tracks = annotationTool.video.get("tracks");
                this.listenTo(this.tracks, "select", this.changeTrack);
                this.listenTo(this.tracks, "visibility", this.updateCategories);
                this.playerAdapter = attr.playerAdapter;

                this.layout = _.pick(attr, "freeText", "categories");
                if (!this.layout.freeText) this.freeTextElement.hide();
                if (!this.layout.categories) this.categoriesElement.hide();

                categories = annotationTool.video.get("categories");

                annotationTool.colorsManager.updateColors(categories.models);

                _.each(DEFAULT_TABS, function (params) {
                    this.addTab(params);
                }, this);

                this.tabsContainerElement.find("div.tab-pane:first-child").addClass("active");
                this.tabsButtonsElement.find("a:first-child").parent().first().addClass("active");
            },

            /**
             * Create a new scale
             */
            createScale: function () {
                new ScaleModal({ create: true }).show();
            },

            /**
             * Edit existing scales
             */
            editScales: function () {
                new ScaleModal().show();
            },

            /**
             * Open a modal to create a new category
             */
            createCategory: function (mine) {
                // TODO We should not set the `hasScale` here ...
                var category = new Category({ settings: {
                    hasScale: false,
                    // TODO This needs to be set depending on the tab
                    //   the butotn was pressed in
                    //   See also the `attributes` key of the `DEFAULT_TABS`.
                    createdAsMine: mine
                } });
                new CategoryModal({ model: category }).show();
                // TODO Maybe activate the corresponding tab afterwards?
            },

            /**
             * Called from "Public" tab
             */
            createCategoryPublic: function () {
                this.createCategory(false);
            },

            /**
             * Called from "Mine" tab
             */
            createCategoryMine: function () {
                this.createCategory(true);
            },

            /**
             * Proxy function for insert through 'enter' keypress
             * @param {event} event Event object
             */
            maybeInsert: function (e) {
                // If enter is pressed and shit not, we insert a new annotation
                if (e.keyCode === 13 && !e.shiftKey) {
                    this.insert();
                }
            },

            /**
             * Insert a new annotation
             * @param {event} event Event object
             */
            insert: function (event) {
                if (event) {
                    event.stopImmediatePropagation();
                }

                var value = this.input.val();

                if (!value) {
                    return;
                }

                annotationTool.createAnnotation({ text: value });

                if (this.continueVideo) {
                    this.continueVideo = false;
                    this.playerAdapter.play();
                }

                this.input.val("");
            },

            /**
             * Change the current selected track by the given one
             * @param {Track} track The new track
             */
            changeTrack: function (track) {
                // If the track is valid, we set it
                if (track) {
                    // TODO Until we update jQuery, we can't use `show` and `hide` here,
                    //   since our current jQuery version does not preserve
                    //   the `display` property correctly.
                    this.$el.find("#annotate-form").css("display", "");
                    this.$el.find(".no-track").hide();

                    this.trackDIV.html(track.get("name"));

                } else {
                    // Otherwise, we disable the input and inform the user that no track is set
                    this.$el.find("#annotate-form").css("display", "none");
                    this.$el.find(".no-track").show();
                    this.trackDIV.html("<span>" + i18next.t("annotate.no selected track") + "</span>");
                }
            },

            /**
             * Listener for when a user start to write a new annotation,
             * manage if the video has to be or not paused.
             */
            maybePause: function () {
                if (!this.$el.find("#pause-video-freetext").prop("checked") || this.playerAdapter.getStatus() === PlayerAdapter.STATUS.PAUSED) {
                    return;
                }

                this.continueVideo = true;
                this.playerAdapter.pause();
            },

            /**
             * Show the tab related to the source from the event
             * @param {Event} event Event object
             */
            showTab: function (event) {
                var tabId = event.currentTarget.dataset.tabid;

                $(event.currentTarget).one("shown", _.bind(function () {
                    this.categoriesTabs[tabId].initCarousel();
                }, this));

                $(event.currentTarget).tab("show");
                this.categoriesTabs[tabId].select();
            },

            /**
             * Add a new categories tab in the annotate view
             * @param {Categories} categories Categories to add to the new tab
             * @param {object} attr Infos about the new tab like id, name, filter for categories and roles.
             */
            addTab: function (attr) {
                var params = {
                    id: attr.id,
                    name: attr.name,
                    filter: attr.filter,
                    roles: attr.roles,
                    attributes: attr.attributes
                };

                if (attr.id === "mine" || (attr.id === "public" && attr.roles.includes("administrator"))) {
                  params.showDropdown = true;
                } else {
                  params.showDropdown = false;
                }

                var newButton = $(this.tabsButtonTemplate(params)).appendTo(this.tabsButtonsElement);
                params.button = newButton;

                params.id = "labelTab-" + params.id;
                var annotateTab = new AnnotateTab(params);

                this.categoriesTabs[attr.id] = annotateTab;
                this.tabsContainerElement.append(annotateTab.$el);
            },

            /**
             * Remove a categories tab from the annotate view based on the associated id
             * @param {object} id the associated id
             */
            removeTab: function (id) {
                delete this.categoriesTabs[id];

                this.tabsButtonsElement.find("a[data-tabid=\"" + id + "\"]").parent().remove();
                this.tabsContainerElement.find("#labelTab-" + id).remove();
            },

            /**
             * Listener for edit modus switch.
             * @param {Event} event Event related to this action
             */
            onSwitchEditModus: function (event) {
                var status = event.target.checked;

                this.switchEditModus(status);

                if (status) {
                    this.showTab({
                        currentTarget: this.categoriesTabs[this.DEFAULT_TAB_ON_EDIT].titleLink.find("a")[0]
                    });
                }
            },

            /**
             * Switch the edit modus to the given status.
             * @param  {boolean} status The current status
             */
            switchEditModus: function (status) {
                this.editModus = status;

                this.$el.find("#annotate-container").toggleClass("edit-on", status);

                // trigger an event that all element switch in edit modus
                annotationTool.trigger(annotationTool.EVENTS.ANNOTATE_TOGGLE_EDIT, status);
            },

            /**
             * Toggle layout for free text annotation only
             */
            toggleFreeTextAnnotationPane: function () {
                this.layout.freeText = !this.layout.freeText;
                // TODO You might have to adapt this as well
                this.freeTextElement.toggle();
            },

            /**
             * Toggle layout for labels annotation
             */
            toggleStructuredAnnotations: function () {
                this.layout.categories = !this.layout.categories;
                this.categoriesElement.toggle();
            },

            /**
             * Shows or hides the free text annotations
             */
            toggleFreeTextAnnotations: function () {
                annotationTool.toggleFreeTextAnnotations();

                this.$el.find("#toggle-free-text").html(
                    toggleFreeTextButtonTemplate({
                        freeTextVisible: annotationTool.freeTextVisible
                    })
                );
            },

            /**
             * Displays Categories Tabs for currently visible tracks
             */
            updateCategories: function () {
                var allTab = this.categoriesTabs["all"];

                this.tracks.each(function (track) {
                    var trackUserId = track.get("created_by");

                    if (track.get("visible")) {

                        // Our own category; should already be visible everywhere
                        if (track.isMine()) {
                            return;
                        }

                        // Otherwise, add a new category to the "All" tab
                        allTab.addCategories(function (category) {

                            if (!categoryFilter(trackUserId, category)) {
                                return false;
                            }

                            // Is the category already present?
                            if (_.some(allTab.categoryViews, function (e) {
                                return e.model.id === category.id;
                            })) {
                                return false;
                            }

                            return true;
                        });

                        // If there is already a tab for this track owner, we don't need to add one
                        if (this.categoriesTabs.hasOwnProperty(trackUserId)) {
                            return;
                        }

                        this.addTab({
                            id: trackUserId,
                            name: track.get("created_by_nickname"),
                            filter: _.partial(categoryFilter, trackUserId),
                            roles: [],
                            attributes: { access: ACCESS.PRIVATE }
                        });
                    } else {
                        // Remove categories/tabs that are no longer supposed to be visible
                        this.removeTab(track.get("created_by"));
                        annotationTool.video.get("categories").chain()
                            .filter(function (category) {
                                return category.get("created_by") === trackUserId
                                    && category.get("settings").createdAsMine
                                    && !category.isMine();
                            })
                            .each(allTab.removeOne);
                    }
                }, this);

                function categoryFilter(trackUserId, category) {
                    // Is it from the mine category?
                    if (!category.get("settings").createdAsMine) {
                        return false;
                    }
                    // Was the category created by the user of the tab?
                    if (category.get("created_by") !== trackUserId) {
                        return false;
                    }

                    return true;
                }
            },

            /**
             * Remove this view from the DOM and clean up all of its data and event handlers
             */
            remove: function () {
                _.each(this.categoriesTabs, function (categoriesTab) {
                    categoriesTab.remove();
                });
                return Backbone.View.prototype.remove.apply(this, arguments);
            }
        });

        return Annotate;
    }
);
