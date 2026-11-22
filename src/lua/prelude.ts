/** The Lua side of the API. It runs once per state, with the host functions as its argument. */
export const PRELUDE = String.raw`
local host = ...

vim = {
	g = {},
	log = { levels = { TRACE = 0, DEBUG = 1, INFO = 2, WARN = 3, ERROR = 4 } },
	keymap = { set = host.keymap_set, del = host.keymap_del },
	cmd = host.cmd,
	notify = host.notify,
}
vim.o = setmetatable({}, { __index = host.get_option, __newindex = host.set_option })
vim.opt = setmetatable({}, {
	__index = function(_, name)
		local value = vim.o[name]
		return { get = function() return value end }
	end,
	__newindex = host.set_option,
})

obsidian = {
	keymap = { set = host.obsidian_set, del = host.obsidian_del },
	command = host.command,
	commands = host.commands,
	action = host.action,
	run = host.run,
	platform = host.platform,
}

function vim.trim(s)
	return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

function vim.startswith(s, prefix)
	return s:sub(1, #prefix) == prefix
end

function vim.endswith(s, suffix)
	return suffix == "" or s:sub(-#suffix) == suffix
end

function vim.split(s, sep, opts)
	local plain = opts and opts.plain
	local parts, start = {}, 1
	while true do
		local first, last = s:find(sep, start, plain)
		if not first or last < first then
			parts[#parts + 1] = s:sub(start)
			return parts
		end
		parts[#parts + 1] = s:sub(start, first - 1)
		start = last + 1
	end
end

function vim.tbl_contains(t, value)
	for _, item in pairs(t) do
		if item == value then return true end
	end
	return false
end

function vim.tbl_keys(t)
	local keys = {}
	for key in pairs(t) do keys[#keys + 1] = key end
	return keys
end

function vim.tbl_values(t)
	local values = {}
	for _, value in pairs(t) do values[#values + 1] = value end
	return values
end

function vim.tbl_extend(behavior, ...)
	if behavior ~= "force" and behavior ~= "keep" and behavior ~= "error" then
		error("invalid behavior: " .. tostring(behavior), 2)
	end
	local result = {}
	for i = 1, select("#", ...) do
		for key, value in pairs((select(i, ...))) do
			if result[key] ~= nil and behavior == "error" then error("key found in more than one table: " .. tostring(key), 2) end
			if result[key] == nil or behavior == "force" then result[key] = value end
		end
	end
	return result
end

function vim.inspect(value, seen)
	if type(value) == "string" then return string.format("%q", value) end
	if type(value) ~= "table" then return tostring(value) end
	seen = seen or {}
	if seen[value] then return "<cycle>" end
	seen[value] = true
	local parts = {}
	for key, item in pairs(value) do
		local name = type(key) == "string" and key:match("^[%a_][%w_]*$") and key or "[" .. vim.inspect(key, seen) .. "]"
		parts[#parts + 1] = name .. " = " .. vim.inspect(item, seen)
	end
	seen[value] = nil
	table.sort(parts)
	return "{ " .. table.concat(parts, ", ") .. " }"
end

function print(...)
	local parts = {}
	for i = 1, select("#", ...) do parts[i] = tostring((select(i, ...))) end
	vim.notify(table.concat(parts, "\t"))
end

local loaded = {}
function require(name)
	if loaded[name] ~= nil then return loaded[name] end
	local value = host.load_module(name)(name)
	if value == nil then value = true end
	loaded[name] = value
	return value
end
`;
