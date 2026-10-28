/*
 * Runtime data loader for data.yaml.
 * The parser intentionally supports the small YAML subset used by this
 * project: indented mappings, lists, quoted strings, and scalar values.
 */
(function loadToolboxData() {
  const scriptUrl = document.currentScript?.src || document.baseURI;
  function stripComment(value) {
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
        quote = quote === character ? null : quote || character;
      } else if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
        return value.slice(0, index).trimEnd();
      }
    }
    return value.trimEnd();
  }

  function splitPair(value) {
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
        quote = quote === character ? null : quote || character;
      } else if (character === ':' && !quote) {
        const key = value.slice(0, index).trim();
        if (!key) throw new Error('YAML 配置包含空字段名');
        return { key, value: value.slice(index + 1).trim() };
      }
    }
    return null;
  }

  function splitInlineList(value) {
    const result = [];
    let quote = null;
    let start = 1;
    for (let index = 1; index < value.length - 1; index += 1) {
      const character = value[index];
      if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
        quote = quote === character ? null : quote || character;
      } else if (character === ',' && !quote) {
        result.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    if (value.slice(start, -1).trim()) result.push(value.slice(start, -1).trim());
    return result.map(parseScalar);
  }

  function parseScalar(value) {
    if (!value) return '';
    if (value.startsWith('[') && value.endsWith(']')) return splitInlineList(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value[0] === '"'
        ? JSON.parse(value)
        : value.slice(1, -1).replace(/''/g, "'");
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
    return value;
  }

  function parseYaml(source) {
    const lines = source.split(/\r?\n/).flatMap((line, lineNumber) => {
      const withoutComment = stripComment(line);
      if (!withoutComment.trim()) return [];
      if (/\t/.test(withoutComment)) throw new Error(`YAML 第 ${lineNumber + 1} 行不能使用 Tab 缩进`);
      const indent = withoutComment.search(/\S/);
      return [{ indent, content: withoutComment.trim() }];
    });
    const cursor = { index: 0 };

    function parseBlock(indent) {
      if (cursor.index >= lines.length || lines[cursor.index].indent < indent) return {};
      if (lines[cursor.index].indent !== indent) throw new Error('YAML 缩进层级不连续');
      return lines[cursor.index].content.startsWith('-') ? parseList(indent) : parseMap(indent);
    }

    function parseMap(indent) {
      const result = {};
      while (cursor.index < lines.length && lines[cursor.index].indent === indent) {
        const line = lines[cursor.index];
        if (line.content.startsWith('-')) break;
        const pair = splitPair(line.content);
        if (!pair) throw new Error(`YAML 字段格式不正确：${line.content}`);
        cursor.index += 1;
        if (pair.value) {
          result[pair.key] = parseScalar(pair.value);
        } else if (cursor.index < lines.length && lines[cursor.index].indent > indent) {
          result[pair.key] = parseBlock(lines[cursor.index].indent);
        } else {
          result[pair.key] = {};
        }
      }
      return result;
    }

    function parseList(indent) {
      const result = [];
      while (cursor.index < lines.length && lines[cursor.index].indent === indent) {
        const line = lines[cursor.index];
        if (!line.content.startsWith('-')) break;
        const rest = line.content.slice(1).trim();
        cursor.index += 1;
        if (!rest) {
          result.push(cursor.index < lines.length && lines[cursor.index].indent > indent ? parseBlock(lines[cursor.index].indent) : null);
          continue;
        }
        const pair = splitPair(rest);
        if (!pair) {
          result.push(parseScalar(rest));
          continue;
        }
        const item = {};
        item[pair.key] = pair.value ? parseScalar(pair.value) : (cursor.index < lines.length && lines[cursor.index].indent > indent ? parseBlock(lines[cursor.index].indent) : {});
        if (cursor.index < lines.length && lines[cursor.index].indent > indent) {
          const continuation = parseBlock(lines[cursor.index].indent);
          if (!continuation || Array.isArray(continuation) || typeof continuation !== 'object') throw new Error('YAML 列表项格式不正确');
          Object.assign(item, continuation);
        }
        result.push(item);
      }
      return result;
    }

    if (!lines.length) return {};
    const result = parseBlock(lines[0].indent);
    if (cursor.index !== lines.length) throw new Error('YAML 配置存在无法解析的内容');
    return result;
  }

  function stringList(value, field, index) {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
      throw new Error(`模组 ${index + 1} 的 ${field} 必须是字符串列表`);
    }
    return value;
  }

  function variantList(value, index) {
    if (!Array.isArray(value) || !value.every(variant => variant && typeof variant === 'object' && !Array.isArray(variant) && typeof variant.name === 'string')) {
      throw new Error(`模组 ${index + 1} 的 variants 必须是对象列表`);
    }
    return value.map((variant, variantIndex) => ({
      name: variant.name,
      feats: stringList(variant.feats, `variants[${variantIndex}].feats`, index)
    }));
  }

  function normalizeConfig(config) {
    if (!config || config.version !== 2 || !Array.isArray(config.modules) || !config.filters) {
      throw new Error('YAML 配置缺少必要字段或版本不正确');
    }
    const filterOptions = {};
    const filterLabels = {};
    Object.entries(config.filters).forEach(([key, filter]) => {
      if (!filter || typeof filter.label !== 'string') throw new Error(`筛选项 ${key} 缺少 label`);
      filterLabels[key] = filter.label;
      filterOptions[key] = stringList(filter.options, `${key}.options`, 0);
    });
    const modules = config.modules.map((module, index) => {
      if (!module || typeof module.id !== 'string' || typeof module.family !== 'string' || typeof module.name !== 'string') {
        throw new Error(`模组 ${index + 1} 缺少 id、family 或 name`);
      }
      const tags = stringList(module.tags, 'tags', index);
      return {
        id: module.id,
        family: module.family,
        name: module.name,
        variants: variantList(module.variants, index),
        tags,
        conditions: stringList(module.conditions, 'conditions', index),
        goals: ['广告', '付费', '留存', '消耗'].filter(goal => tags.includes(goal)),
        costs: ['待补充']
      };
    });
    if (new Set(modules.map(module => module.id)).size !== modules.length) throw new Error('模组 id 不能重复');
    return { modules, filterOptions, filterLabels };
  }

  async function readConfig() {
    const url = new URL('data.yaml', scriptUrl).href;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`无法读取 data.yaml（${response.status}）`);
      return response.text();
    } catch (fetchError) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', url);
        request.onload = () => request.status === 0 || (request.status >= 200 && request.status < 300)
          ? resolve(request.responseText)
          : reject(fetchError);
        request.onerror = () => reject(fetchError);
        request.send();
      });
    }
  }

  window.toolboxDataReady = readConfig().then(source => normalizeConfig(parseYaml(source)));
}());
