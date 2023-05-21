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

function byId(id) {
    return document.getElementById(id);
}

(function() {
    var output = byId('output'),
        template_source = byId('output-template').innerHTML;

    // we attach a function to our window object that will be called whenever
    // our panel is shown (see devtools.js)
    window.updateDiff = function(initial_resources, modified_resources) {
        var context = {
                'resources': []
            };

        for (url in modified_resources) {
            context['resources'].push({
                'diff': JsDiff.createPatch(
                    url,
                    initial_resources[url],
                    modified_resources[url]
                )
            });
        }

        output.innerHTML = Mustache.render(template_source, context);
    }

})();
