/*
 * Copyright 2013 FatBox Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *   http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
chrome.devtools.panels.create(
    'CSS Diff',
    'assets/cssdiff-icon.png',
    'panel/index.html',
    function(panel) {
        var initial_resources = {},
            modified_resources = {};

        // collect our current resources
        chrome.devtools.inspectedWindow.getResources(function(resources) {
            for (var i = 0, c = resources.length; i < c; i++) {
                if (resources[i].type == 'stylesheet') {
                    // use a self invoking function here to make sure the correct
                    // instance of `resource` is used in the callback
                    (function(resource) {
                        resource.getContent(function(content, encoding) {
                            initial_resources[resource.url] = content;
                        });
                    })(resources[i]);
                }
            }
        });

        // add a listener to track committed changes to resources
        chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(resource, content) {
            modified_resources[resource.url] = content;
        });

        panel.onShown.addListener(function(window) {
            window.updateDiff(initial_resources, modified_resources);
        });
    }
);
